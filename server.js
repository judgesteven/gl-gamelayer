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
const API_KEY = process.env.GAMELAYER_API_KEY || '9567d1ba99b22b84ee2c27cadb56fde7';
const ACCOUNT_ID = process.env.GAMELAYER_ACCOUNT_ID || 'ai-test';
const API_BASE_URL = process.env.GAMELAYER_API_BASE_URL || 'https://api.gamelayer.co/api/v0';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Log configuration (without sensitive data)
console.log('Server configuration:', {
    API_BASE_URL,
    ACCOUNT_ID,
    NODE_ENV: process.env.NODE_ENV,
    hasApiKey: !!API_KEY
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
app.use('/uploads', express.static('public/uploads'));

// Add middleware to parse multipart/form-data
app.use((req, res, next) => {
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        // Let multer handle the request
        next();
    } else {
        // Parse JSON or URL-encoded data
        express.json()(req, res, next);
    }
});

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
        'api-key': API_KEY,
        'x-api-key': API_KEY // Try both header formats
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
        headers: { ...headers, 'api-key': '***', 'x-api-key': '***' },
        body: body ? { ...body, imgUrl: body.imgUrl ? '[BASE64_IMAGE]' : undefined } : undefined
    });

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) {
            console.error('GameLayer API error:', {
                status: response.status,
                statusText: response.statusText,
                error: data,
                headers: response.headers
            });

            if (response.status === 401) {
                throw new Error('API authentication failed. Please check your API key.');
            }

            throw new Error(data.error || 'API request failed');
        }

        return data;
    } catch (error) {
        console.error('GameLayer API request failed:', error);
        throw error;
    }
}

// Add a test endpoint to verify API key
app.get('/api/test-auth', async (req, res) => {
    try {
        const response = await makeGameLayerRequest('/players', 'GET');
        res.json({ message: 'API authentication successful', data: response });
    } catch (error) {
        res.status(500).json({ 
            error: 'API authentication failed',
            message: error.message
        });
    }
});

// Sign up endpoint
app.post('/api/signup', upload.single('avatar'), async (req, res) => {
    try {
        console.log('Received signup request:', {
            body: req.body,
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : null,
            headers: req.headers
        });

        // Check if we have form data
        if (!req.body) {
            console.error('No request body received');
            return res.status(400).json({
                error: "No request body received"
            });
        }

        // Check if we have the data field
        if (!req.body.data) {
            console.error('Missing data field in request body:', req.body);
            return res.status(400).json({
                error: "Missing data field in request body"
            });
        }

        let authData;
        try {
            authData = JSON.parse(req.body.data);
            console.log('Parsed auth data:', {
                email: authData.email,
                hasPassword: !!authData.password,
                name: authData.name
            });
        } catch (error) {
            console.error('JSON parse error:', error);
            return res.status(400).json({
                error: "Invalid JSON data in data field"
            });
        }

        const { email, password, name } = authData;

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

        // Add image URL if an image was uploaded
        if (req.file) {
            const base64Image = req.file.buffer.toString('base64');
            requestBody.imgUrl = `data:${req.file.mimetype};base64,${base64Image}`;
        }

        try {
            await makeGameLayerRequest('/players', 'POST', requestBody);
        } catch (error) {
            console.error('GameLayer API error:', error);
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
            token,
            redirect: '/dashboard.html'
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
            headers: req.headers,
            contentType: req.headers['content-type']
        });

        // Check if we have form data
        if (!req.body) {
            console.error('No request body received');
            return res.status(400).json({
                error: "No request body received"
            });
        }

        let authData;
        // Handle both JSON and form data
        if (req.body.data) {
            try {
                authData = JSON.parse(req.body.data);
            } catch (error) {
                console.error('JSON parse error:', error);
                return res.status(400).json({
                    error: "Invalid JSON data in data field"
                });
            }
        } else {
            // Direct JSON data
            authData = req.body;
        }

        console.log('Parsed auth data:', {
            email: authData.email,
            hasPassword: !!authData.password
        });

        const { email, password } = authData;

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

        // Get player data from GameLayer
        try {
            const playerData = await makeGameLayerRequest(`/players/${email}`, 'GET');
            res.status(200).json({
                message: "Signed in successfully",
                token,
                redirect: '/dashboard.html',
                player: playerData
            });
        } catch (error) {
            console.error('Error fetching player data:', error);
            // Still return success if we can't get player data
            res.status(200).json({
                message: "Signed in successfully",
                token,
                redirect: '/dashboard.html'
            });
        }
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

// API endpoint to get current player data
app.get('/api/player/me', authenticateToken, async (req, res) => {
    try {
        const email = req.user.email;
        const user = users.get(email);
        
        if (!user) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        // Get player data from GameLayer
        try {
            const playerData = await makeGameLayerRequest(`/players/${email}`, 'GET');
            res.json({
                ...playerData,
                email: user.email,
                name: user.name
            });
        } catch (error) {
            console.error('Error fetching player data:', error);
            // Return basic user data if GameLayer API fails
            res.json({
                email: user.email,
                name: user.name,
                points: 0,
                missionsCompleted: 0,
                rewardsClaimed: 0,
                imgUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
            });
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// API endpoint to get player missions
app.get('/api/missions/me', authenticateToken, async (req, res) => {
    try {
        const email = req.user.email;
        
        try {
            const missions = await makeGameLayerRequest(`/missions?player=${email}`, 'GET');
            res.json(missions);
        } catch (error) {
            console.error('Error fetching missions:', error);
            // Return empty missions array if GameLayer API fails
            res.json([]);
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// API endpoint to get rankings
app.get('/api/rankings', authenticateToken, async (req, res) => {
    try {
        try {
            const rankings = await makeGameLayerRequest('/players', 'GET');
            // Sort players by points in descending order
            const sortedRankings = rankings.sort((a, b) => (b.points || 0) - (a.points || 0));
            res.json(sortedRankings);
        } catch (error) {
            console.error('Error fetching rankings:', error);
            // Return empty rankings array if GameLayer API fails
            res.json([]);
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// API endpoint to get player rewards
app.get('/api/rewards/me', authenticateToken, async (req, res) => {
    try {
        const email = req.user.email;
        
        try {
            const rewards = await makeGameLayerRequest(`/prizes?player=${email}`, 'GET');
            res.json(rewards);
        } catch (error) {
            console.error('Error fetching rewards:', error);
            // Return empty rewards array if GameLayer API fails
            res.json([]);
        }
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

// Serve the dashboard page
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
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