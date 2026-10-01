import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import 'leaflet/dist/leaflet.css';
import './index.css';

import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { TrackerProvider } from './context/TrackerContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <TrackerProvider>
          <App />
        </TrackerProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
