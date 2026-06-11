import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.tsx'
import './index.css'

// In production (Render static site), VITE_API_BASE_URL is set to the backend URL.
// In development, the Vite proxy handles /api → localhost:8000 so we leave it empty.
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL ?? ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
