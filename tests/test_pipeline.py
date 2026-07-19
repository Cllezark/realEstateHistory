"""Tests for the St. Pete Real Estate ETL pipeline."""

import sys
from pathlib import Path

import pytest
import pandas as pd
import geopandas as gpd

# Ensure src is importable
sys.path.insert(0, str(Path(__file__).parent))
from src.utils import pad_tract_geoid, sha256_hex, load_config


class TestUtils:
    """Tests for utility functions."""

    def test_pad_tract_geoid_normal(self):
        assert pad_tract_geoid("12103026809") == "12103026809"
        assert pad_tract_geoid(12103026809) == "12103026809"

    def test_pad_tract_geoid_short(self):
        assert pad_tract_geoid("123") == "00000000123"

    def test_pad_tract_geoid_none(self):
        assert pad_tract_geoid(None) is None
        assert pad_tract_geoid("") is None

    def test_pad_tract_geoid_whitespace(self):
        assert pad_tract_geoid("  12103026809  ") == "12103026809"

    def test_sha256_consistent(self, tmp_path):
        f = tmp_path / "test.txt"
        f.write_text("hello world")
        h1 = sha256_hex(f)
        h2 = sha256_hex(f)
        assert h1 == h2
        assert len(h1) == 64

    def test_load_config(self):
        config_path = Path(__file__).parent / "config.yaml"
        if config_path.exists():
            config = load_config(config_path)
            assert "pipeline" in config
            assert "geography" in config
            assert "sale_filter" in config


class TestOutputValidation:
    """Tests that validate pipeline outputs exist and are well-formed."""

    @pytest.fixture
    def output_dir(self):
        d = Path(__file__).parent / "output"
        if not d.exists():
            pytest.skip("Output directory not found. Run pipeline first.")
        return d

    def test_dashboard_exists(self, output_dir):
        path = output_dir / "dashboard_tract_quarter.parquet"
        assert path.exists(), f"Missing: {path}"

    def test_dashboard_columns(self, output_dir):
        path = output_dir / "dashboard_tract_quarter.parquet"
        if not path.exists():
            pytest.skip("Dashboard not generated")
        df = pd.read_parquet(path)
        required = ["tract_geoid", "year", "quarter", "quarter_id",
                     "qualified_sale_count", "median_sale_price"]
        for col in required:
            assert col in df.columns, f"Missing column: {col}"

    def test_tract_geoid_preserved(self, output_dir):
        path = output_dir / "dashboard_tract_quarter.parquet"
        if not path.exists():
            pytest.skip("Dashboard not generated")
        df = pd.read_parquet(path)
        sample = df["tract_geoid"].dropna().iloc[0]
        assert isinstance(sample, str), f"GEOID is {type(sample)}, expected str"
        assert len(sample) == 11, f"GEOID length: {len(sample)}, expected 11"

    def test_dashboard_uniqueness(self, output_dir):
        path = output_dir / "dashboard_tract_quarter.parquet"
        if not path.exists():
            pytest.skip("Dashboard not generated")
        df = pd.read_parquet(path)
        dupes = df.duplicated(subset=["tract_geoid", "year", "quarter"]).sum()
        assert dupes == 0, f"Found {dupes} duplicate primary keys"

    def test_nonnegative_prices(self, output_dir):
        path = output_dir / "dashboard_tract_quarter.parquet"
        if not path.exists():
            pytest.skip("Dashboard not generated")
        df = pd.read_parquet(path)
        if "median_sale_price" in df.columns:
            valid = df["median_sale_price"].dropna()
            neg = (valid < 0).sum()
            assert neg == 0, f"Found {neg} negative median prices"

    def test_geojson_export(self, output_dir):
        path = output_dir / "pinellas_tracts_dashboard.geojson"
        if not path.exists():
            pytest.skip("GeoJSON not generated")
        gdf = gpd.read_file(path)
        assert len(gdf) > 0
        assert "tract_geoid" in gdf.columns

    def test_sale_date_range(self, output_dir):
        path = output_dir / "silver_sales.parquet"
        if not path.exists():
            pytest.skip("Sales not generated")
        df = pd.read_parquet(path)
        dates = df["sale_date"].dropna()
        assert dates.min() >= pd.Timestamp("2021-01-01"), f"Min date: {dates.min()}"
        assert dates.max() <= pd.Timestamp.now(), f"Max date exceeds today: {dates.max()}"

    def test_quality_metrics_exist(self, output_dir):
        path = output_dir / "etl_quality_metrics.parquet"
        if not path.exists():
            pytest.skip("Quality metrics not generated")

    def test_tract_geometry_exists(self, output_dir):
        path = output_dir / "dim_census_tract.parquet"
        if not path.exists():
            pytest.skip("Tract geometry not generated")
        gdf = gpd.read_parquet(path)
        assert "tract_geoid" in gdf.columns
        assert "geometry" in gdf.columns


class TestPipelineIntegration:
    """Integration tests for pipeline logic."""

    def test_config_integrity(self):
        config_path = Path(__file__).parent / "config.yaml"
        if not config_path.exists():
            pytest.skip("Config not found")
        config = load_config(config_path)
        assert config["geography"]["state_fips"] == "12"
        assert config["geography"]["county_fips"] == "103"
        assert config["geography"]["city"]["place_fips"] == "63000"
        assert config["sale_filter"]["min_sale_date"] == "2021-01-01"

    def test_fhfa_prefix(self):
        config = load_config(Path(__file__).parent / "config.yaml")
        prefix = config["fhfa"]["tract_id_prefix"]
        assert prefix == "12103", f"FHFA tract prefix should be 12103, got {prefix}"

    def test_pcpao_strap_length(self):
        config = load_config(Path(__file__).parent / "config.yaml")
        assert config["pcpao"]["strap_length"] == 18


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
