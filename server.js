const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();
const admin = require('firebase-admin');

// Ignore punycode deprecation warning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
    if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
        return;
    }
    console.warn(warning);
});

const app = express();
const port = process.env.PORT || 3000;

// API Configuration
const API_KEY = process.env.GAMELAYER_API_KEY || '9567d1ba99b22b84ee2c27cadb56fde7';
const ACCOUNT_ID = process.env.GAMELAYER_ACCOUNT_ID || 'ai-test';
const API_BASE_URL = process.env.GAMELAYER_API_URL || 'https://api.gamelayer.co/api/v0';

// Server configuration
const PORT = process.env.PORT || 3000;

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
    if (!process.env.FIREBASE_PRIVATE_KEY) {
        console.warn('Firebase private key not found in environment variables. Running in development mode without Firebase.');
        firebaseApp = null;
    } else {
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID || "ai-testing-f3b39",
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
            })
        });
        console.log('Firebase initialized successfully');
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
    console.warn('Continuing without Firebase authentication. Some features may be limited.');
    firebaseApp = null;
}

// Middleware to verify Firebase token
async function verifyFirebaseToken(req, res, next) {
    if (!firebaseApp) {
        console.warn('Firebase not initialized, skipping token verification');
        // In production, we'll still try to get the token but won't verify it
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];
            try {
                // Just decode the token without verification
                const decodedToken = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                req.user = decodedToken;
                console.log('Token decoded (not verified):', decodedToken);
            } catch (error) {
                console.warn('Error decoding token:', error);
            }
        }
        next();
        return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('No token provided in request');
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

        console.log('Fetching GameLayer player data for Firebase UID:', uid);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        // Dynamically use the Firebase UID as player-id in GameLayer API call
        const playerUrl = `${API_BASE_URL}/players/${uid}?account=${ACCOUNT_ID}`;
        console.log('Making request to GameLayer API:', playerUrl);

        const playerResponse = await fetch(playerUrl, {
            method: 'GET',
            headers: headers
        });

        const playerData = await playerResponse.json();
        console.log('GameLayer API response:', {
            status: playerResponse.status,
            data: playerData
        });

        if (playerResponse.ok) {
            console.log('Returning player data:', playerData);
            res.status(200).json(playerData);
        } else {
            console.error('Error fetching player data:', playerData);
            res.status(playerResponse.status).json(playerData);
        }
    } catch (error) {
        console.error('Server error during sign-in:', error);
        res.status(500).json({ 
            error: error.message,
            errorCode: 500
        });
    }
});

// Get player data
app.get('/api/players/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        console.log('Fetching player data for UID:', uid);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        // Dynamically use the Firebase UID as player-id in GameLayer API call
        const playerUrl = `${API_BASE_URL}/players/${uid}?account=${ACCOUNT_ID}`;
        console.log('Making request to GameLayer API:', playerUrl);

        const playerResponse = await fetch(playerUrl, {
            method: 'GET',
            headers: headers
        });

        const playerData = await playerResponse.json();
        console.log('GameLayer API response:', {
            status: playerResponse.status,
            data: playerData
        });

        if (playerResponse.ok) {
            console.log('Returning player data:', playerData);
            res.status(200).json(playerData);
        } else {
            console.error('Error fetching player data:', playerData);
            res.status(playerResponse.status).json(playerData);
        }
    } catch (error) {
        console.error('Server error during sign-in:', error);
        res.status(500).json({ 
            error: error.message,
            errorCode: 500
        });
    }
});

// Get team data
app.get('/api/teams/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        console.log('Fetching team data for ID:', teamId);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        // Get team data from GameLayer
        const teamUrl = `${API_BASE_URL}/teams/${teamId}?account=${ACCOUNT_ID}`;
        console.log('Making request to GameLayer API:', teamUrl);

        const teamResponse = await fetch(teamUrl, {
            method: 'GET',
            headers: headers
        });

        const teamData = await teamResponse.json();
        console.log('GameLayer API response:', {
            status: teamResponse.status,
            data: teamData
        });

        if (teamResponse.ok) {
            console.log('Returning team data:', teamData);
            res.status(200).json(teamData);
        } else {
            console.error('Error fetching team data:', teamData);
            res.status(teamResponse.status).json(teamData);
        }
    } catch (error) {
        console.error('Server error during team fetch:', error);
        res.status(500).json({ 
            error: error.message,
            errorCode: 500
        });
    }
});

// Get missions for a player
app.get('/api/missions/:uid', verifyFirebaseToken, async (req, res) => {
    try {
        const { uid } = req.params;
        console.log('Fetching missions for player:', uid);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        // Get missions from GameLayer using the correct endpoint and parameter
        const missionsUrl = `${API_BASE_URL}/missions?account=${ACCOUNT_ID}&player-id=${uid}`;
        console.log('Making request to GameLayer API:', {
            url: missionsUrl,
            headers: headers,
            method: 'GET'
        });

        const missionsResponse = await fetch(missionsUrl, {
            method: 'GET',
            headers: headers
        });

        console.log('GameLayer API response status:', missionsResponse.status);
        console.log('GameLayer API response headers:', Object.fromEntries(missionsResponse.headers.entries()));

        const missionsData = await missionsResponse.json();
        console.log('GameLayer API response data:', JSON.stringify(missionsData, null, 2));

        if (missionsResponse.ok) {
            // Ensure we're returning an array of missions
            const missions = Array.isArray(missionsData) ? missionsData : [missionsData];
            console.log('Returning missions data:', missions);
            res.status(200).json(missions);
        } else {
            console.error('Error fetching missions:', missionsData);
            res.status(missionsResponse.status).json({
                error: missionsData.error || 'Failed to fetch missions',
                details: missionsData
            });
        }
    } catch (error) {
        console.error('Server error during missions fetch:', error);
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Only start the server if we're not in a serverless environment
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log('Development mode:', process.env.NODE_ENV !== 'production');
        console.log('Firebase initialized:', !!firebaseApp);
    });

    // Keep track of connections
    let activeConnections = 0;
    server.on('connection', (socket) => {
        activeConnections++;
        console.log('New connection. Active connections:', activeConnections);
        
        socket.on('close', () => {
            activeConnections--;
            console.log('Connection closed. Active connections:', activeConnections);
        });
    });

    // Keep the server alive
    function keepAlive() {
        server.getConnections((err, connections) => {
            if (err) {
                console.error('Error getting connections:', err);
            }
            console.log(`Active connections: ${connections}`);
        });
        setTimeout(keepAlive, 10000); // Check every 10 seconds
    }

    keepAlive();

    // Handle server shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Shutting down gracefully...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received. Shutting down gracefully...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
}

// Export the app for Vercel
module.exports = app; 