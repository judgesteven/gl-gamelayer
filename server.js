const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();
const admin = require('firebase-admin');

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

// Initialize Firebase Admin
let firebaseApp;
try {
    firebaseApp = admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
    // Don't throw the error, just log it and continue
}

// Middleware to verify Firebase token
async function verifyFirebaseToken(req, res, next) {
    if (!firebaseApp) {
        console.error('Firebase not initialized');
        return res.status(500).json({ error: 'Authentication service unavailable' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
}

// API endpoint to create a player
app.post('/api/players', upload.single('avatar'), async (req, res) => {
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
            player: player, // This will be the Firebase UID
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
            'api-key': API_KEY
        };

        console.log('Making request to GameLayer API:', {
            url: `${API_BASE_URL}/players`,
            headers: headers,
            body: requestBody
        });

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
        const { uid } = req.body;
        
        if (!uid) {
            console.log('Sign-in attempt with no UID provided');
            return res.status(400).json({
                error: "UID is required",
                errorCode: 400
            });
        }

        console.log('Attempting to sign in user with UID:', uid);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        const apiUrl = `${API_BASE_URL}/players/${uid}`;
        console.log('Making request to GameLayer API:', {
            url: apiUrl,
            headers: {
                ...headers,
                'api-key': '***'
            }
        });

        // Check if player exists
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: headers
        });

        console.log('GameLayer API response status:', response.status);
        const data = await response.json();
        console.log('GameLayer API response data:', data);

        if (!response.ok) {
            console.error('GameLayer API error:', {
                status: response.status,
                statusText: response.statusText,
                error: data
            });
            
            if (response.status === 404) {
                console.log('Player not found in GameLayer');
                return res.status(404).json({
                    error: "Player not found",
                    errorCode: 404
                });
            }
            
            return res.status(response.status).json(data);
        }

        // If we get here, the player exists
        console.log('Player found in GameLayer:', data);
        res.status(200).json(data);
    } catch (error) {
        console.error('Server error during sign-in:', error);
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

// Serve the profile page
app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// Get player data
app.get('/api/players/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        console.log('Fetching player data for UID:', uid);

        const response = await fetch(`${API_BASE_URL}/players/${uid}`, {
            method: 'GET',
            headers: {
                'api-key': API_KEY
            }
        });

        const data = await response.json();
        console.log('Player data response:', data);

        if (response.ok) {
            res.json(data);
        } else {
            console.error('Error fetching player data:', data);
            res.status(response.status).json(data);
        }
    } catch (error) {
        console.error('Error in /api/players/:uid:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
}).on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please try a different port.`);
    }
});

// Keep the process running
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit on uncaught exceptions
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejections
});

// Keep the process alive
process.stdin.resume();

// Handle the punycode deprecation warning
process.on('warning', (warning) => {
    if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
        // Ignore the punycode deprecation warning
        return;
    }
    console.warn(warning);
});

// Keep the process alive
setInterval(() => {
    // This keeps the event loop running
}, 1000);

module.exports = app; 