// RENDER-SPECIFIC DEPLOYMENT WITH APS/OR-TOOLS
// This file should ONLY be deployed on Render, not Vercel
// Render should use this file as the main entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Render APS Backend is running',
    features: ['OR-Tools', 'APS Scheduling'],
    timestamp: new Date().toISOString()
  });
});

// Alternative health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'APS Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// APS Calculate Production Time endpoint
app.post('/api/aps/calculate-time', async (req, res) => {
  try {
    const { productType, quantity, inputDiameter, outputDiameter } = req.body;
    
    const pythonScript = path.join(__dirname, 'albayrak_aps_scheduler_render.py');
    const pythonProcess = spawn('python3', [
      '-c',
      `
import sys
sys.path.append('${__dirname}')
from albayrak_aps_scheduler_render import AlbayrakAPSScheduler
import json

scheduler = AlbayrakAPSScheduler()
time = scheduler.calculate_production_time(
    '${productType}',
    ${quantity},
    ${inputDiameter || 'None'},
    ${outputDiameter || 'None'}
)
print(json.dumps({'time': time}))
      `
    ]);
    
    let result = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python error:', error);
        return res.status(500).json({ error: 'Failed to calculate production time' });
      }
      
      try {
        const parsed = JSON.parse(result);
        res.json(parsed);
      } catch (e) {
        console.error('Parse error:', e);
        res.status(500).json({ error: 'Failed to parse result' });
      }
    });
    
  } catch (error) {
    console.error('Calculate time error:', error);
    res.status(500).json({ error: error.message });
  }
});

// APS Optimize Schedule endpoint
app.post('/api/aps/optimize-schedule', async (req, res) => {
  try {
    const { orders } = req.body;
    
    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ error: 'Orders array is required' });
    }
    
    const pythonProcess = spawn('python3', [
      '-c',
      `
import sys
sys.path.append('${__dirname}')
from albayrak_aps_scheduler_render import AlbayrakAPSScheduler
import json

scheduler = AlbayrakAPSScheduler()
orders = ${JSON.stringify(orders)}
result = scheduler.create_schedule(orders)
print(json.dumps(result))
      `
    ]);
    
    let result = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python error:', error);
        return res.status(500).json({ 
          error: 'Failed to optimize schedule',
          details: error 
        });
      }
      
      try {
        const parsed = JSON.parse(result);
        res.json(parsed);
      } catch (e) {
        console.error('Parse error:', e);
        res.status(500).json({ 
          error: 'Failed to parse optimization result',
          details: e.message 
        });
      }
    });
    
  } catch (error) {
    console.error('Optimize schedule error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Missing endpoints that frontend is calling
app.get('/api/warmup', (req, res) => {
  res.json({ status: 'success', message: 'Server warmed up' });
});

app.get('/api/aps/line-capacities', (req, res) => {
  res.json({
    tel_cekme: { daily: 15000, hourly: 625, unit: 'kg' },
    galvaniz: { daily: 128500, hourly: 5354, unit: 'kg' },
    panel_cit: { daily: 500, hourly: 21, unit: 'panels' },
    celik_hasir: { daily: 11000, hourly: 458, unit: 'kg' },
    civi: { daily: 5000, hourly: 208, unit: 'kg' },
    tavli_tel: { daily: 3000, hourly: 125, unit: 'kg' },
    profil: { daily: 300, hourly: 12, unit: 'units' },
    palet: { daily: 30, hourly: 1, unit: 'units' }
  });
});

app.get('/api/aps/factory-status', (req, res) => {
  res.json({
    overall_efficiency: 78,
    active_orders: 12,
    completed_today: 8,
    lines: {
      tel_cekme: { status: 'running', efficiency: 85, current_order: 'GT-2024-001' },
      galvaniz: { status: 'running', efficiency: 92, current_order: 'GT-2024-002' },
      panel_cit: { status: 'maintenance', efficiency: 0, current_order: null },
      celik_hasir: { status: 'running', efficiency: 76, current_order: 'CH-2024-003' },
      civi: { status: 'running', efficiency: 68, current_order: 'CV-2024-004' },
      tavli_tel: { status: 'idle', efficiency: 0, current_order: null },
      profil: { status: 'running', efficiency: 45, current_order: 'PR-2024-005' },
      palet: { status: 'idle', efficiency: 0, current_order: null }
    }
  });
});

app.get('/api/aps/schedules', (req, res) => {
  const { created_by, limit } = req.query;
  res.json([
    {
      id: 1,
      name: 'Weekly Production Plan',
      created_by: created_by || 'selman2',
      created_at: '2024-08-13T10:00:00Z',
      status: 'active',
      orders_count: 15,
      completion_rate: 67
    }
  ]);
});

app.post('/api/aps/calculate-tlc', (req, res) => {
  const { input_diameter, output_diameter } = req.body;
  // Mock TLC calculation - replace with actual logic later
  const speed = Math.floor(Math.random() * 300) + 400; // 400-700 kg/h
  res.json({ speed, unit: 'kg/h' });
});

// Test endpoint to verify OR-Tools is installed
app.get('/api/aps/test', async (req, res) => {
  const pythonProcess = spawn('python3', [
    '-c',
    'import ortools; print("OR-Tools version:", ortools.__version__)'
  ]);
  
  let result = '';
  let error = '';
  
  pythonProcess.stdout.on('data', (data) => {
    result += data.toString();
  });
  
  pythonProcess.stderr.on('data', (data) => {
    error += data.toString();
  });
  
  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      return res.json({ 
        status: 'error',
        message: 'OR-Tools not installed',
        error: error 
      });
    }
    res.json({ 
      status: 'success',
      message: result.trim()
    });
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Render APS Backend running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  POST /api/aps/calculate-time');
  console.log('  POST /api/aps/optimize-schedule');
  console.log('  GET /api/aps/test');
});

module.exports = app;