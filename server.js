const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// API Configuration
const API_KEY = '9567d1ba99b22b84ee2c27cadb56fde7';
const ACCOUNT_ID = 'ai-test';
const API_BASE_URL = 'https://api.gamelayer.co/api/v0';

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
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// API endpoint to create a player
app.post('/api/create-player', upload.single('avatar'), async (req, res) => {
    try {
        console.log('Received request:', {
            body: req.body,
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : null
        });

        // Parse the JSON data from the form
        const playerData = JSON.parse(req.body.data);
        
        // Validate required fields
        const { player, name, account } = playerData;
        if (!player || !name || !account) {
            return res.status(400).json({
                error: "Missing required fields: player, name, and account are required",
                errorCode: 400
            });
        }

        // Create the request body
        const requestBody = {
            player: player,
            name: name,
            account: ACCOUNT_ID
        };

        // Add image URL if an image was uploaded
        if (req.file) {
            // Convert the image buffer to base64
            const base64Image = req.file.buffer.toString('base64');
            requestBody.imgUrl = `data:${req.file.mimetype};base64,${base64Image}`;
        }

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-key': API_KEY
        };

        const response = await fetch(`${API_BASE_URL}/players`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('GameLayer API error:', {
                status: response.status,
                statusText: response.statusText,
                error: data
            });
            return res.status(response.status).json(data);
        }

        res.status(response.status).json(data);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message,
            errorCode: 500
        });
    }
});

// API endpoint to sign in
app.post('/api/sign-in', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                error: "Email is required",
                errorCode: 400
            });
        }

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-key': API_KEY
        };

        // Check if player exists
        const response = await fetch(`${API_BASE_URL}/accounts/${ACCOUNT_ID}/players/${email}`, {
            method: 'GET',
            headers: headers
        });

        if (response.status === 404) {
            return res.status(404).json({
                error: "Player not found",
                errorCode: 404
            });
        }

        const data = await response.json();

        if (!response.ok) {
            console.error('GameLayer API error:', {
                status: response.status,
                statusText: response.statusText,
                error: data
            });
            return res.status(response.status).json(data);
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message,
            errorCode: 500
        });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For Vercel deployment
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = app; 