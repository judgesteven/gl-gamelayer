const { spawn } = require('child_process');
const path = require('path');

// Function to start the server
function startServer() {
    console.log('Starting server...');
    const server = spawn('node', ['server.js'], {
        stdio: 'inherit',
        detached: true
    });

    server.on('error', (error) => {
        console.error('Failed to start server:', error);
    });

    server.on('exit', (code, signal) => {
        console.log(`Server exited with code ${code} and signal ${signal}`);
        // Restart the server if it exits
        setTimeout(startServer, 1000);
    });

    // Handle process termination
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Shutting down gracefully...');
        server.kill('SIGTERM');
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received. Shutting down gracefully...');
        server.kill('SIGINT');
    });
}

// Start the server
startServer(); 