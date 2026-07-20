import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ChartViewer } from './components/DetailsPanel/ChartViewer.tsx'

const params = new URLSearchParams(window.location.search);
const view = params.get('view');
const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    {view === 'chart-viewer' ? <ChartViewer /> : <App />}
  </StrictMode>,
)
