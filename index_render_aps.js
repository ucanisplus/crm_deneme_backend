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