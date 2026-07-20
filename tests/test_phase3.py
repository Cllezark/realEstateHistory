"""Tests for Phase 3 historical integration: schema adapter, multi-parcel
derivation, cutover boundaries, and the 2010-2020 tract bridge."""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.normalize_os_sales import _derive_multi_parcel
from src.tract_bridge import classify_relationships
from src.utils import load_config

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "output"
CONFIG = PROJECT_ROOT / "config.yaml"


class TestMultiParcelDerivation:
    """Unit tests for the deed-grouping multi-parcel rule."""

    def _frame(self, rows):
        return pd.DataFrame(rows, columns=["strap", "sale_date", "book_page"])

    def test_two_parcels_one_deed_flagged(self):
        df = self._frame([
            ("A" * 18, pd.Timestamp("2015-06-01"), "100 / 200"),
            ("B" * 18, pd.Timestamp("2015-06-01"), "100 / 200"),
        ])
        flag = _derive_multi_parcel(df)
        assert flag.tolist() == [True, True]

    def test_single_parcel_deed_not_flagged(self):
        df = self._frame([
            ("A" * 18, pd.Timestamp("2015-06-01"), "100 / 200"),
            ("B" * 18, pd.Timestamp("2015-06-01"), "300 / 400"),
        ])
        flag = _derive_multi_parcel(df)
        assert flag.tolist() == [False, False]

    def test_same_deed_different_date_not_flagged(self):
        df = self._frame([
            ("A" * 18, pd.Timestamp("2015-06-01"), "100 / 200"),
            ("B" * 18, pd.Timestamp("2015-09-01"), "100 / 200"),
        ])
        flag = _derive_multi_parcel(df)
        assert flag.tolist() == [False, False]

    def test_duplicate_strap_on_deed_not_multi(self):
        # The same parcel twice on one deed is a duplicate, not multi-parcel
        df = self._frame([
            ("A" * 18, pd.Timestamp("2015-06-01"), "100 / 200"),
            ("A" * 18, pd.Timestamp("2015-06-01"), "100 / 200"),
        ])
        flag = _derive_multi_parcel(df)
        assert flag.tolist() == [False, False]

    def test_missing_book_page_is_na(self):
        df = self._frame([
            ("A" * 18, pd.Timestamp("2015-06-01"), None),
            ("B" * 18, pd.Timestamp("2015-06-01"), ""),
        ])
        flag = _derive_multi_parcel(df)
        assert flag.isna().all()


class TestBridgeClassification:
    """Unit tests for 2010-2020 relationship classification."""

    def _classify(self, pairs):
        rel = pd.DataFrame(pairs, columns=["tract_geoid_2010", "tract_geoid_2020"])
        return classify_relationships(rel).tolist()

    def test_one_to_one(self):
        assert self._classify([("T10A", "T20A")]) == ["one_to_one"]

    def test_split(self):
        result = self._classify([("T10A", "T20A"), ("T10A", "T20B")])
        assert result == ["one_2010_to_many_2020"] * 2

    def test_merge(self):
        result = self._classify([("T10A", "T20A"), ("T10B", "T20A")])
        assert result == ["many_2010_to_one_2020"] * 2

    def test_many_to_many(self):
        result = self._classify([
            ("T10A", "T20A"), ("T10A", "T20B"), ("T10B", "T20A"),
        ])
        # T10A splits into A+B while T20A merges A+B -> all three rows touch
        # a many-to-many relationship on at least one side
        assert result[0] == "many_to_many"
        assert result[1] in ("many_to_many", "one_2010_to_many_2020")
        assert result[2] in ("many_to_many", "many_2010_to_one_2020")


class TestHistoricalOutputs:
    """Validate pipeline outputs for the historical extension (skip when the
    pipeline has not been run)."""

    @pytest.fixture
    def config(self):
        return load_config(CONFIG)

    def _load(self, name):
        path = OUTPUT_DIR / name
        if not path.exists():
            pytest.skip(f"{name} not found. Run pipeline first.")
        return pd.read_parquet(path)

    def test_combined_silver_has_both_schema_versions(self):
        combined = self._load("silver_sales_combined.parquet")
        versions = set(combined["source_schema_version"].unique())
        assert "pcpao_os_v1" in versions
        assert "pcpao_current_v1" in versions

    def test_historical_rows_respect_cutover(self, config):
        hist = self._load("silver_os_sales.parquet")
        cutover = pd.Timestamp(config["historical"]["cutover_date"])
        assert hist["sale_date"].max() < cutover

    def test_current_rows_start_at_cutover(self, config):
        combined = self._load("silver_sales_combined.parquet")
        current = combined[combined["source_schema_version"] == "pcpao_current_v1"]
        cutover = pd.Timestamp(config["historical"]["cutover_date"])
        assert current["sale_date"].min() >= cutover

    def test_no_duplicate_sales_across_sources(self):
        combined = self._load("silver_sales_combined.parquet")
        key = ["strap", "sale_date", "sale_price", "book_page"]
        dupes = combined.duplicated(subset=key).sum()
        # The 2021+ overlap is excluded by the cutover filter, so cross-source
        # duplication should be zero; within-source exact dupes were removed
        assert dupes == 0, f"{dupes} duplicate sales across sources"

    def test_dashboard_extends_to_2011(self):
        dash = self._load("dashboard_tract_quarter.parquet")
        assert dash["quarter_id"].min() == "2011-Q1"
        hist = dash[dash["year"] < 2021]
        assert hist["qualified_sale_count"].notna().sum() > 0

    def test_dashboard_never_zero_fills_missing_history(self):
        dash = self._load("dashboard_tract_quarter.parquet")
        hist = dash[dash["year"] < 2021]
        # Cells without sales must be null, never zero
        assert (hist["median_sale_price"].dropna() > 0).all()

    def test_bridge_geoids_preserved_as_text(self):
        bridge = self._load("bridge_tract_2010_2020.parquet")
        assert (bridge["tract_geoid_2010"].str.len() == 11).all()
        assert (bridge["tract_geoid_2020"].str.len() == 11).all()

    def test_bridge_land_shares_reconstruct_2010_tracts(self):
        # Every bridge row participates in reconstruction, including
        # county-crossing slivers; all-water tracts (ALAND=0) have no land
        # to reconstruct and their NaN shares sum to 0 by construction
        bridge = self._load("bridge_tract_2010_2020.parquet")
        share_sum = bridge.groupby("tract_geoid_2010")["source_land_share"].sum()
        land_tracts = share_sum[share_sum > 0]
        assert len(land_tracts) >= 240
        assert ((land_tracts - 1).abs() < 0.02).all()

    def test_fhfa_kept_on_source_geography(self):
        fhfa = self._load("fact_tract_hpi_annual.parquet")
        assert (fhfa["fhfa_geography_method"] == "source_tract_code").all()

    def test_mortgage_rates_cover_2011(self):
        rates = self._load("fact_mortgage_rate_quarter.parquet")
        assert rates["quarter_id"].min() == "2011-Q1"
        # No quarterly gaps in the combined series
        expected = {f"{y}-Q{q}" for y in range(2011, 2026) for q in range(1, 5)}
        missing = expected - set(rates["quarter_id"])
        assert not missing, f"Missing rate quarters: {sorted(missing)}"
