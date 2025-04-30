const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// API Configuration
const API_KEY = process.env.GAMELAYER_API_KEY;
const ACCOUNT_ID = process.env.GAMELAYER_ACCOUNT_ID;
const API_BASE_URL = process.env.GAMELAYER_API_BASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

// Validate required environment variables
if (!API_KEY || !ACCOUNT_ID || !API_BASE_URL || !JWT_SECRET) {
    console.error('Missing required environment variables. Please check your .env file.');
    process.exit(1);
}

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
app.use('/uploads', express.static('public/uploads'));

// In-memory user storage (replace with a database in production)
const users = new Map();

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Helper function to make GameLayer API requests
async function makeGameLayerRequest(endpoint, method = 'GET', body = null) {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
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
        body: body ? { ...body, imgUrl: body.imgUrl ? '[BASE64_IMAGE]' : undefined } : undefined
    });

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) {
            console.error('GameLayer API error:', {
                status: response.status,
                statusText: response.statusText,
                error: data
            });
            throw new Error(data.error || 'API request failed');
        }

        return data;
    } catch (error) {
        console.error('GameLayer API request failed:', error);
        throw error;
    }
}

// Sign up endpoint
app.post('/api/signup', async (req, res) => {
    try {
        console.log('Received signup request:', {
            body: req.body,
            headers: req.headers
        });

        const { email, password, name } = req.body;

        // Validate required fields
        if (!email || !password || !name) {
            console.error('Missing required fields:', { email: !!email, password: !!password, name: !!name });
            return res.status(400).json({
                error: "Missing required fields: email, password, and name are required"
            });
        }

        // Check if user already exists
        if (users.has(email)) {
            return res.status(400).json({
                error: "User already exists"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create GameLayer player
        const requestBody = {
            player: email,
            name: name,
            account: ACCOUNT_ID
        };

        try {
            await makeGameLayerRequest('/players', 'POST', requestBody);
        } catch (error) {
            return res.status(500).json({
                error: "Failed to create player in GameLayer"
            });
        }

        // Store user data
        users.set(email, {
            email,
            password: hashedPassword,
            name
        });

        // Generate JWT token
        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' });

        res.status(201).json({
            message: "User created successfully",
            token
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// Sign in endpoint
app.post('/api/signin', async (req, res) => {
    try {
        console.log('Received signin request:', {
            body: req.body,
            headers: req.headers
        });

        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            console.error('Missing required fields:', { email: !!email, password: !!password });
            return res.status(400).json({
                error: "Missing required fields: email and password are required"
            });
        }

        // Check if user exists
        const user = users.get(email);
        if (!user) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        // Generate JWT token
        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' });

        res.status(200).json({
            message: "Signed in successfully",
            token
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// Protected route example
app.get('/api/protected', authenticateToken, (req, res) => {
    res.json({ message: "This is a protected route", user: req.user });
});

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

        // Check if player exists
        const headers = {
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        try {
            const checkResponse = await fetch(`${API_BASE_URL}/players/${player}`, {
                method: 'GET',
                headers: headers
            });

            if (checkResponse.ok) {
                // Player exists, return success with exists flag
                return res.status(200).json({
                    message: "Player already exists",
                    player: player,
                    exists: true
                });
            }
        } catch (error) {
            console.error('Error checking player existence:', error);
        }

        // Validate refresh offset format if provided
        if (playerData.refreshOffset) {
            const offsetRegex = /^UTC[+-]([0-1][0-9]|2[0-4]):[0-5][0-9]$/;
            if (!offsetRegex.test(playerData.refreshOffset)) {
                return res.status(400).json({
                    error: "Invalid refresh offset format. Must be in format UTC±HH:MM",
                    errorCode: 400
                });
            }
        }

        // Create the request body
        const requestBody = {
            player: player,
            name: name,
            account: ACCOUNT_ID,
            refreshOffset: playerData.refreshOffset || undefined
        };

        // Add image URL if an image was uploaded
        if (req.file) {
            // Convert the image buffer to base64
            const base64Image = req.file.buffer.toString('base64');
            requestBody.imgUrl = `data:${req.file.mimetype};base64,${base64Image}`;
        }

        headers['Content-Type'] = 'application/json';

        console.log('Sending request to GameLayer:', {
            url: `${API_BASE_URL}/players`,
            method: 'POST',
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

        res.status(response.status).json({
            ...data,
            exists: false
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message,
            errorCode: 500
        });
    }
});

// API endpoint to get player data
app.get('/api/player/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const headers = {
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        const response = await fetch(`${API_BASE_URL}/players/${playerId}`, {
            method: 'GET',
            headers: headers
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

// API endpoint to get missions
app.get('/api/missions/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const headers = {
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        const response = await fetch(`${API_BASE_URL}/missions?player=${playerId}`, {
            method: 'GET',
            headers: headers
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

// API endpoint to get prizes
app.get('/api/prizes/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const headers = {
            'Accept': 'application/json',
            'api-key': API_KEY
        };

        const response = await fetch(`${API_BASE_URL}/prizes?player=${playerId}`, {
            method: 'GET',
            headers: headers
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

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the dashboard page
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// For Vercel deployment
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = app; 