const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const multer = require('multer');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// API Configuration
const API_KEY = process.env.GAMELAYER_API_KEY || '9567d1ba99b22b84ee2c27cadb56fde7';
const ACCOUNT_ID = process.env.GAMELAYER_ACCOUNT_ID || 'ai-test';
const API_BASE_URL = process.env.GAMELAYER_API_BASE_URL || 'https://api.gamelayer.co/api/v0';

// Log configuration (without sensitive data)
console.log('Server configuration:', {
    API_BASE_URL,
    ACCOUNT_ID,
    NODE_ENV: process.env.NODE_ENV,
    hasApiKey: !!API_KEY,
    apiKeyLength: API_KEY ? API_KEY.length : 0
});

// Configure multer for image upload
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Helper function to make GameLayer API requests
async function makeGameLayerRequest(method, endpoint, body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': API_KEY
    };

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    console.log(`Making ${method} request to GameLayer API:`, {
        url: `${API_BASE_URL}${endpoint}`,
        headers: { ...headers, 'api-key': '***' },
        body: body ? { ...body, avatar: body.avatar ? '[BASE64_IMAGE]' : undefined } : undefined
    });

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) {
            console.error('GameLayer API error:', {
                status: response.status,
                statusText: response.statusText,
                error: data,
                endpoint,
                method
            });
            return null;
        }

        return data;
    } catch (error) {
        console.error('GameLayer API request failed:', error);
        return null;
    }
}

// API endpoint to create a player
app.post('/api/create-player', upload.single('avatar'), async (req, res) => {
    try {
        console.log('Received create player request:', {
            body: req.body,
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : null
        });

        // Validate form data
        if (!req.body.data) {
            return res.status(400).json({ error: 'Missing form data' });
        }

        // Parse the JSON data
        const playerData = JSON.parse(req.body.data);
        console.log('Parsed player data:', playerData);

        // Validate required fields
        if (!playerData.player || !playerData.name) {
            return res.status(400).json({ error: 'Player ID and name are required' });
        }

        // Check if player already exists
        const existingPlayer = await makeGameLayerRequest('GET', `/players/${playerData.player}`);
        if (existingPlayer) {
            return res.status(400).json({ error: 'Player already exists' });
        }

        // Prepare the request body
        const requestBody = {
            player: playerData.player,
            name: playerData.name
        };

        // Handle avatar if present
        if (req.file) {
            console.log('Processing avatar file:', {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            });

            try {
                // Convert file to base64
                const base64Image = req.file.buffer.toString('base64');
                const mimeType = req.file.mimetype;
                requestBody.avatar = `data:${mimeType};base64,${base64Image}`;
                
                console.log('Avatar added to request:', {
                    mimeType,
                    base64Length: base64Image.length
                });
            } catch (error) {
                console.error('Error processing avatar:', error);
            }
        }

        console.log('Sending request to GameLayer:', {
            ...requestBody,
            avatar: requestBody.avatar ? '[BASE64_IMAGE]' : undefined
        });

        // Create player in GameLayer
        const response = await makeGameLayerRequest('POST', '/players', requestBody);
        if (!response) {
            throw new Error('Failed to create player in GameLayer');
        }

        res.json({ message: 'Player created successfully', player: response });
    } catch (error) {
        console.error('Error creating player:', error);
        res.status(500).json({ error: error.message || 'Failed to create player' });
    }
});

// API endpoint to get player data
app.get('/api/player/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const playerData = await makeGameLayerRequest('GET', `/players/${playerId}`);
        
        if (!playerData) {
            return res.status(404).json({
                error: "Player not found"
            });
        }

        res.json(playerData);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// API endpoint to get missions
app.get('/api/missions/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const missions = await makeGameLayerRequest('GET', `/missions?player=${playerId}`);
        res.json(missions || []);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// API endpoint to get prizes
app.get('/api/prizes/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const prizes = await makeGameLayerRequest('GET', `/prizes?player=${playerId}`);
        res.json(prizes || []);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// API endpoint to get rankings
app.get('/api/rankings', async (req, res) => {
    try {
        const rankings = await makeGameLayerRequest('GET', '/players');
        // Sort players by points in descending order
        const sortedRankings = (rankings || []).sort((a, b) => (b.points || 0) - (a.points || 0));
        res.json(sortedRankings);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// For Vercel deployment
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = app; 