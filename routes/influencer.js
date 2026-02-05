const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { Influencer, User } = require('../models/models');

// Middleware to check if user is admin
const adminCheck = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (user && user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error checking admin status' });
    }
};

/**
 * @route   POST /api/influencers
 * @desc    Create a new influencer
 * @access  Admin
 */
router.post('/', authMiddleware, adminCheck, async (req, res) => {
    try {
        const { name, referral_code, discount_percent } = req.body;

        // Validation
        if (!name || !referral_code || discount_percent === undefined) {
            return res.status(400).json({ success: false, message: 'Please provide name, referral code, and discount percent' });
        }

        // Check if code exists
        const existing = await Influencer.findOne({ where: { referral_code } });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Referral code already exists' });
        }

        const influencer = await Influencer.create({
            name,
            referral_code,
            discount_percent
        });

        res.status(201).json({
            success: true,
            message: 'Influencer created successfully',
            influencer
        });
    } catch (error) {
        console.error('Error creating influencer:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * @route   GET /api/influencers
 * @desc    Get all influencers
 * @access  Admin
 */
router.get('/', authMiddleware, adminCheck, async (req, res) => {
    try {
        const influencers = await Influencer.findAll({
            order: [['created_at', 'DESC']]
        });
        res.json({ success: true, influencers });
    } catch (error) {
        console.error('Error fetching influencers:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * @route   PUT /api/influencers/:id
 * @desc    Update influencer
 * @access  Admin
 */
router.put('/:id', authMiddleware, adminCheck, async (req, res) => {
    try {
        const { name, referral_code, discount_percent, is_active } = req.body;
        const influencer = await Influencer.findByPk(req.params.id);

        if (!influencer) {
            return res.status(404).json({ success: false, message: 'Influencer not found' });
        }

        // Check for duplicate code if changing
        if (referral_code && referral_code !== influencer.referral_code) {
            const existing = await Influencer.findOne({ where: { referral_code } });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Referral code already taken' });
            }
        }

        await influencer.update({
            name: name || influencer.name,
            referral_code: referral_code || influencer.referral_code,
            discount_percent: discount_percent !== undefined ? discount_percent : influencer.discount_percent,
            is_active: is_active !== undefined ? is_active : influencer.is_active
        });

        res.json({
            success: true,
            message: 'Influencer updated successfully',
            influencer
        });
    } catch (error) {
        console.error('Error updating influencer:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * @route   GET /api/influencers/validate/:code
 * @desc    Validate a referral code
 * @access  Public
 */
router.get('/validate/:code', async (req, res) => {
    try {
        const { code } = req.params;

        const influencer = await Influencer.findOne({
            where: {
                referral_code: code,
                is_active: true
            }
        });

        if (!influencer) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or inactive referral code'
            });
        }

        res.json({
            success: true,
            code: influencer.referral_code,
            discount_percent: influencer.discount_percent
        });
    } catch (error) {
        console.error('Error validating referral code:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
