let clients = [];
let onlineUsers = {};

function sendEventToAll(eventName, data = {}) {
    const eventString = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    const currentClients = [...clients];
    currentClients.forEach(client => {
        try {
            client.res.write(eventString);
        } catch (error) {
            console.error(`[SSE] Failed to send event to client ${client.id}:`, error.message);
            clients = clients.filter(c => c.id !== client.id);
        }
    });
}

function sendEventToUser(targetUserId, eventName, data = {}) {
    const eventString = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    const targetIdStr = targetUserId.toString();
    const targetClients = clients.filter(client => client.userId.toString() === targetIdStr);
    
    if (targetClients.length > 0) {
        targetClients.forEach(client => {
            try {
                client.res.write(eventString);
            } catch (error) {
                console.error(`[SSE] Failed to send event to specific client ${client.id}:`, error.message);
                clients = clients.filter(c => c.id !== client.id);
            }
        });
    }
}

function addClient(client) {
    clients.push(client);
    onlineUsers[client.userId] = true;
    sendEventToAll('user_status_changed', { userId: client.userId, status: 'online' });
}

function removeClient(clientToRemove) {
    clients = clients.filter(c => c.id !== clientToRemove.id);
    const isStillOnline = clients.some(c => c.userId === clientToRemove.userId);
    if (!isStillOnline) {
        delete onlineUsers[clientToRemove.userId];
        sendEventToAll('user_status_changed', { userId: clientToRemove.userId, status: 'offline' });
    }
}

function getOnlineUsers() {
    return onlineUsers;
}

module.exports = {
    sendEventToAll,
    sendEventToUser,
    addClient,
    removeClient,
    getOnlineUsers
};
