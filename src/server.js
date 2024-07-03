const http = require('http');
const app = require('./app');
// const socket = require('socket.io');

const server = http.createServer(app);
// const io = socket(server);


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});