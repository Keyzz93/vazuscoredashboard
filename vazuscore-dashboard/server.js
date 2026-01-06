// ===================================
// VAZUSCORE DASHBOARD WEB AVEC MONGODB
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
    mongoURI: process.env.MONGODB_URI || 'mongodb+srv://lasers880_db_user:7qu5wAbBbn5UN6u1@cluster0.9ix9tqy.mongodb.net/vazuscore?retryWrites=true&w=majority',
    port: process.env.PORT || 3000
};

const app = express();

// ===================================
// CONNEXION MONGODB
// ===================================

mongoose.connect(config.mongoURI)
    .then(() => console.log('✅ MongoDB connecté (Dashboard) !'))
    .catch(err => console.error('❌ Erreur MongoDB Dashboard:', err));

// ===================================
// SCHEMAS MONGODB (identiques au bot)
// ===================================

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
    lastRob: { type: Number, default: 0 },
    lastFish: { type: Number, default: 0 },
    lastMine: { type: Number, default: 0 },
    lastBeg: { type: Number, default: 0 }
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
    
    // Récupérer la config depuis MongoDB
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
    
    // Mettre à jour ou créer la config dans MongoDB
    let guildConfig = await GuildConfig.findOne({ guildId });
    if (!guildConfig) {
        guildConfig = new GuildConfig({ guildId });
    }
    
    guildConfig.welcomeChannel = req.body.welcomeChannel || null;
    guildConfig.welcomeMessage = req.body.welcomeMessage || 'Bienvenue {user} sur **{server}** ! 🎉';
    guildConfig.leaveChannel = req.body.leaveChannel || null;
    guildConfig.logChannel = req.body.logChannel || null;
    guildConfig.levelUpMessages = req.body.levelUpMessages === 'true';
    guildConfig.autoRoleId = req.body.autoRoleId || null;
    guildConfig.antiLink = req.body.antiLink === 'true';
    
    await guildConfig.save();
    
    res.json({ success: true, message: 'Configuration sauvegardée !' });
});

// API - Statistiques d'un serveur
app.get('/api/guild/:guildId/stats', checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        // Récupérer tous les utilisateurs du serveur depuis MongoDB
        const guildUsers = await UserData.find({ guildId });
        
        const totalUsers = guildUsers.length;
        const totalXP = guildUsers.reduce((sum, u) => sum + (u.xp || 0), 0);
        const totalMoney = guildUsers.reduce((sum, u) => sum + (u.money || 0) + (u.bank || 0), 0);
        
        const topUsers = guildUsers
            .sort((a, b) => (b.xp || 0) - (a.xp || 0))
            .slice(0, 5)
            .map(user => ({
                id: user.userId,
                level: user.level || 1,
                xp: user.xp || 0,
                money: (user.money || 0) + (user.bank || 0)
            }));
        
        res.json({
            totalUsers,
            totalXP,
            totalMoney,
            topUsers
        });
    } catch (error) {
        console.error('Erreur stats:', error);
        res.json({
            totalUsers: 0,
            totalXP: 0,
            totalMoney: 0,
            topUsers: []
        });
    }
});

// API - Membres d'un serveur
app.get('/api/guild/:guildId/members', checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const guildUsers = await UserData.find({ guildId });
        
        const members = guildUsers.map(user => ({
            id: user.userId,
            level: user.level || 1,
            xp: user.xp || 0,
            money: user.money || 0,
            bank: user.bank || 0
        }));
        
        res.json(members);
    } catch (error) {
        console.error('Erreur membres:', error);
        res.json([]);
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
        console.error('Erreur modif argent:', error);
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
        console.error('Erreur modif niveau:', error);
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
║   💾 MongoDB: Connecté               ║
╚══════════════════════════════════════╝
    `);
});

module.exports = app;
