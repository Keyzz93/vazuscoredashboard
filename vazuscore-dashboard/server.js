// ===================================
// VAZUSCORE DASHBOARD WEB
// Créé pour gérer le bot via navigateur
// ===================================

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fs = require('fs');

// Configuration
const config = {
    clientID: process.env.CLIENT_ID || '1453914738231869542',
    clientSecret: process.env.CLIENT_SECRET || 'dA_KBEmLQtnsc5wzrHWh4nIzqleGF3ff',
    callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/callback',
    dashboardURL: process.env.DASHBOARD_URL || 'http://localhost:3000',
    port: process.env.PORT || 3000
};

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session
app.use(session({
    secret: 'vazuscore-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 } // 24h
}));

// Passport Discord OAuth2
passport.use(new DiscordStrategy({
    clientID: config.clientID,
    clientSecret: config.clientSecret,
    callbackURL: config.callbackURL,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(passport.initialize());
app.use(passport.session());

// Middleware pour vérifier l'authentification
function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

// Fonction pour charger les données du bot
function loadBotData() {
    try {
        if (fs.existsSync('./data.json')) {
            return JSON.parse(fs.readFileSync('./data.json', 'utf8'));
        }
    } catch (error) {
        console.error('Erreur chargement données:', error);
    }
    return { userData: {}, warnings: {}, guildConfig: {}, tickets: {}, linkWarnings: {} };
}

// Fonction pour sauvegarder les données
function saveBotData(data) {
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

// ===================================
// ROUTES
// ===================================

// Page d'accueil
app.get('/', (req, res) => {
    res.render('index', { user: req.user });
});

// Login Discord
app.get('/login', passport.authenticate('discord'));

// Callback Discord
app.get('/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/dashboard')
);

// Logout
app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

// Dashboard principal
app.get('/dashboard', checkAuth, (req, res) => {
    const userGuilds = req.user.guilds.filter(g => 
        (g.permissions & 0x8) === 0x8 || g.owner
    );
    res.render('dashboard', { user: req.user, guilds: userGuilds });
});

// Configuration d'un serveur
app.get('/dashboard/:guildId', checkAuth, (req, res) => {
    const guildId = req.params.guildId;
    const userGuilds = req.user.guilds.filter(g => 
        (g.permissions & 0x8) === 0x8 || g.owner
    );
    const guild = userGuilds.find(g => g.id === guildId);
    
    if (!guild) return res.redirect('/dashboard');
    
    const botData = loadBotData();
    const guildConfig = botData.guildConfig[guildId] || {
        welcomeChannel: null,
        welcomeMessage: 'Bienvenue {user} sur **{server}** ! 🎉',
        leaveChannel: null,
        logChannel: null,
        levelUpMessages: true,
        autoRoleId: null,
        antiLink: true
    };
    
    res.render('guild', { 
        user: req.user, 
        guild: guild, 
        config: guildConfig 
    });
});

// Sauvegarder la config d'un serveur
app.post('/api/guild/:guildId/config', checkAuth, (req, res) => {
    const guildId = req.params.guildId;
    const userGuilds = req.user.guilds.filter(g => 
        (g.permissions & 0x8) === 0x8 || g.owner
    );
    const guild = userGuilds.find(g => g.id === guildId);
    
    if (!guild) return res.status(403).json({ error: 'Accès refusé' });
    
    const botData = loadBotData();
    if (!botData.guildConfig[guildId]) {
        botData.guildConfig[guildId] = {};
    }
    
    // Mettre à jour la config
    const config = botData.guildConfig[guildId];
    config.welcomeChannel = req.body.welcomeChannel || null;
    config.welcomeMessage = req.body.welcomeMessage || 'Bienvenue {user} sur **{server}** ! 🎉';
    config.leaveChannel = req.body.leaveChannel || null;
    config.logChannel = req.body.logChannel || null;
    config.levelUpMessages = req.body.levelUpMessages === 'true';
    config.autoRoleId = req.body.autoRoleId || null;
    config.antiLink = req.body.antiLink === 'true';
    
    saveBotData(botData);
    
    res.json({ success: true, message: 'Configuration sauvegardée !' });
});

// API - Statistiques d'un serveur
app.get('/api/guild/:guildId/stats', checkAuth, (req, res) => {
    const guildId = req.params.guildId;
    const botData = loadBotData();
    
    const guildUsers = botData.userData[guildId] || {};
    const totalUsers = Object.keys(guildUsers).length;
    const totalXP = Object.values(guildUsers).reduce((sum, u) => sum + u.xp, 0);
    const totalMoney = Object.values(guildUsers).reduce((sum, u) => sum + u.money + u.bank, 0);
    
    const topUsers = Object.entries(guildUsers)
        .sort(([, a], [, b]) => b.xp - a.xp)
        .slice(0, 5)
        .map(([id, data]) => ({
            id,
            level: data.level,
            xp: data.xp,
            money: data.money + data.bank
        }));
    
    res.json({
        totalUsers,
        totalXP,
        totalMoney,
        topUsers
    });
});

// API - Membres d'un serveur
app.get('/api/guild/:guildId/members', checkAuth, (req, res) => {
    const guildId = req.params.guildId;
    const botData = loadBotData();
    
    const guildUsers = botData.userData[guildId] || {};
    const members = Object.entries(guildUsers).map(([id, data]) => ({
        id,
        level: data.level,
        xp: data.xp,
        money: data.money,
        bank: data.bank
    }));
    
    res.json(members);
});

// API - Gérer l'argent d'un membre
app.post('/api/guild/:guildId/member/:userId/money', checkAuth, (req, res) => {
    const { guildId, userId } = req.params;
    const { amount } = req.body;
    
    const botData = loadBotData();
    if (!botData.userData[guildId] || !botData.userData[guildId][userId]) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    
    botData.userData[guildId][userId].money = parseInt(amount);
    saveBotData(botData);
    
    res.json({ success: true, message: 'Argent modifié !' });
});

// API - Gérer le niveau d'un membre
app.post('/api/guild/:guildId/member/:userId/level', checkAuth, (req, res) => {
    const { guildId, userId } = req.params;
    const { level } = req.body;
    
    const botData = loadBotData();
    if (!botData.userData[guildId] || !botData.userData[guildId][userId]) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    
    const newLevel = parseInt(level);
    botData.userData[guildId][userId].level = newLevel;
    botData.userData[guildId][userId].xp = Math.pow(newLevel * 10, 2);
    saveBotData(botData);
    
    res.json({ success: true, message: 'Niveau modifié !' });
});

// ===================================
// DÉMARRAGE DU SERVEUR
// ===================================

app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════╗
║   🌐 VAZUSCORE DASHBOARD WEB        ║
║   📡 Port: ${config.port}                     ║
║   🔗 URL: ${config.dashboardURL}    ║
╚══════════════════════════════════════╝
    `);
});

module.exports = app;
