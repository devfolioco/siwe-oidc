import { createClient } from 'redis';
import config from '../config/index.js';

class RedisClient {
    constructor() {
        this.client = createClient({
            url: config.redisUrl.toString(),
            database: 2
        });
        
        this.client.on('error', (err) => console.error('Redis Client Error', err));
    }

    async connect() {
        await this.client.connect();
    }

    async disconnect() {
        await this.client.disconnect();
    }

    // Client management
    async getClient(clientId) {
        return await this.client.get(`client:${clientId}`);
    }

    async setClient(clientId, clientData) {
        await this.client.set(`client:${clientId}`, JSON.stringify(clientData));
    }

    async deleteClient(clientId) {
        await this.client.del(`client:${clientId}`);
    }

    // Session management
    async getSession(sessionId) {
        return await this.client.get(`session:${sessionId}`);
    }

    async setSession(sessionId, sessionData, ttl = 3600) {
        await this.client.set(`session:${sessionId}`, JSON.stringify(sessionData), {
            EX: ttl
        });
    }

    async deleteSession(sessionId) {
        await this.client.del(`session:${sessionId}`);
    }

    // Authorization code management
    async getAuthCode(code) {
        return await this.client.get(`auth_code:${code}`);
    }

    async setAuthCode(code, codeData, ttl = 300) {
        await this.client.set(`auth_code:${code}`, JSON.stringify(codeData), {
            EX: ttl
        });
    }

    async deleteAuthCode(code) {
        await this.client.del(`auth_code:${code}`);
    }

    // Token management
    async getToken(token) {
        return await this.client.get(`token:${token}`);
    }

    async setToken(token, tokenData, ttl = 3600) {
        await this.client.set(`token:${token}`, JSON.stringify(tokenData), {
            EX: ttl
        });
    }

    async deleteToken(token) {
        await this.client.del(`token:${token}`);
    }
}

export default new RedisClient();