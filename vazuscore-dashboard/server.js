// ===================================
// VAZUSCORE DASHBOARD WEB
// Créé pour gérer le bot via navigateur
// ===================================

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const mongoose = require('mongoose');

// Configuration
const config = {
    clientID: process.env.CLIENT_ID || '1453914738231869542',
    clientSecret: process.env.CLIENT_SECRET || 'dA_KBEmLQtnsc5wzrHWh4nIzqleGF3ff',
    callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/callback',
    dashboardURL: process.env.DASHBOARD_URL || 'http://localhost:3000',
    mongoURI: process.env.MONGODB_URI,
    port: process.env.PORT || 3000
};

// Connexion à MongoDB
if (config.mongoURI) {
    mongoose.connect(config.mongoURI)
        .then(() => console.log('✅ MongoDB connecté !'))
        .catch(err => console.error('❌ Erreur MongoDB:', err));
}

// Schémas MongoDB
const userSchema = new mongoose.Schema({
    guildId: String,
    userId: String,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    lastXP: { type: Number, default: 0 },
    money: { type: Number, default: 1000 },
    bank: { type: Number, default: 0 },
    lastDaily: { type: Number, default: 0 },
    lastWork: { type: Number, default: 0 },
    lastRob: { type: Number, default: 0 }
});

const guildConfigSchema = new mongoose.Schema({
    guildId: String,
    welcomeChannel: String,
    welcomeMessage: { type: String, default: 'Bienvenue {user} sur **{server}** ! 🎉' },
    leaveChannel: String,
    logChannel: String,
    levelUpMessages: { type: Boolean, default: true },
    autoRoleId: String,
    antiLink: { type: Boolean, default: true }
});

const UserData = mongoose.model('UserData', userSchema);
const GuildConfig = mongoose.model('GuildConfig', guildConfigSchema);

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
    cookie: { maxAge: 86400000 }
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
app.get('/dashboard/:guildId', checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const userGuilds = req.user.guilds.filter(g => 
        (g.permissions & 0x8) === 0x8 || g.owner
    );
    const guild = userGuilds.find(g => g.id === guildId);
    
    if (!guild) return res.redirect('/dashboard');
    
    let guildConfig = await GuildConfig.findOne({ guildId });
    if (!guildConfig) {
        guildConfig = {
            welcomeChannel: null,
            welcomeMessage: 'Bienvenue {user} sur **{server}** ! 🎉',
            leaveChannel: null,
            logChannel: null,
            levelUpMessages: true,
            autoRoleId: null,
            antiLink: true
        };
    }
    
    res.render('guild', { 
        user: req.user, 
        guild: guild, 
        config: guildConfig 
    });
});

// Sauvegarder la config d'un serveur
app.post('/api/guild/:guildId/config', checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const userGuilds = req.user.guilds.filter(g => 
        (g.permissions & 0x8) === 0x8 || g.owner
    );
    const guild = userGuilds.find(g => g.id === guildId);
    
    if (!guild) return res.status(403).json({ error: 'Accès refusé' });
    
    try {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            {
                guildId,
                welcomeChannel: req.body.welcomeChannel || null,
                welcomeMessage: req.body.welcomeMessage || 'Bienvenue {user} sur **{server}** ! 🎉',
                leaveChannel: req.body.leaveChannel || null,
                logChannel: req.body.logChannel || null,
                levelUpMessages: req.body.levelUpMessages === 'true',
                autoRoleId: req.body.autoRoleId || null,
                antiLink: req.body.antiLink === 'true'
            },
            { upsert: true, new: true }
        );
        
        res.json({ success: true, message: 'Configuration sauvegardée !' });
    } catch (error) {
        console.error('Erreur sauvegarde config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API - Statistiques d'un serveur
app.get('/api/guild/:guildId/stats', checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const users = await UserData.find({ guildId });
        
        const totalUsers = users.length;
        const totalXP = users.reduce((sum, u) => sum + u.xp, 0);
        const totalMoney = users.reduce((sum, u) => sum + u.money + u.bank, 0);
        
        const topUsers = users
            .sort((a, b) => b.xp - a.xp)
            .slice(0, 5)
            .map(u => ({
                id: u.userId,
                level: u.level,
                xp: u.xp,
                money: u.money + u.bank
            }));
        
        res.json({
            totalUsers,
            totalXP,
            totalMoney,
            topUsers
        });
    } catch (error) {
        console.error('Erreur stats:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API - Membres d'un serveur
app.get('/api/guild/:guildId/members', checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const users = await UserData.find({ guildId });
        
        const members = users.map(u => ({
            id: u.userId,
            level: u.level,
            xp: u.xp,
            money: u.money,
            bank: u.bank
        }));
        
        res.json(members);
    } catch (error) {
        console.error('Erreur membres:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API - Gérer l'argent d'un membre
app.post('/api/guild/:guildId/member/:userId/money', checkAuth, async (req, res) => {
    const { guildId, userId } = req.params;
    const { amount } = req.body;
    
    try {
        const user = await UserData.findOne({ guildId, userId });
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }
        
        user.money = parseInt(amount);
        await user.save();
        
        res.json({ success: true, message: 'Argent modifié !' });
    } catch (error) {
        console.error('Erreur modification argent:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API - Gérer le niveau d'un membre
app.post('/api/guild/:guildId/member/:userId/level', checkAuth, async (req, res) => {
    const { guildId, userId } = req.params;
    const { level } = req.body;
    
    try {
        const user = await UserData.findOne({ guildId, userId });
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }
        
        const newLevel = parseInt(level);
        user.level = newLevel;
        user.xp = Math.pow(newLevel * 10, 2);
        await user.save();
        
        res.json({ success: true, message: 'Niveau modifié !' });
    } catch (error) {
        console.error('Erreur modification niveau:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
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
║   💾 MongoDB: ${config.mongoURI ? 'Connecté ✅' : 'Non configuré ❌'} ║
╚══════════════════════════════════════╝
    `);
});

module.exports = app;
