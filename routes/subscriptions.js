const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/authMiddleware');
const { sequelize, SubscriptionPlan, Subscription, FlashSale, FlashSaleTier, FlashSaleUsage, User, Influencer, SubscriptionPurchase } = require('../models/models');
const subscriptionController = require('../controllers/subscriptionController');

// =================================================================
// --- SUBSCRIPTION MANAGEMENT API ROUTES ---
// =================================================================

/**
 * @route   GET /api/subscriptions/plans
 * @desc    Get all available subscription plans
 * @access  Public
 */
router.get('/plans', async (req, res) => {
    try {
        const plans = await SubscriptionPlan.findAll({
            where: { is_active: true },
            order: [['price', 'ASC']]
        });

        res.json({
            success: true,
            plans
        });
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch subscription plans'
        });
    }
});

/**
 * @route   POST /api/subscriptions/purchase
 * @desc    Purchase a subscription plan
 * @access  Private
 */
router.post('/purchase', authMiddleware, subscriptionController.purchaseSubscription);

/**
 * @route   POST /api/subscriptions/create-razorpay-order
 * @desc    Create Razorpay order for subscription
 * @access  Private
 */
router.post('/create-razorpay-order', authMiddleware, subscriptionController.createRazorpayOrder);

/**
 * @route   GET /api/subscriptions/my-subscription
 * @desc    Get current user's subscription status
 * @access  Private
 */
router.get('/my-subscription', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const subscription = await Subscription.findOne({
            where: {
                user_id: userId,
                status: 'active'
            },
            include: [{
                model: SubscriptionPlan,
                as: 'plan'
            }],
            order: [['created_at', 'DESC']]
        });

        if (!subscription) {
            return res.json({
                success: true,
                is_premium_member: false,
                message: 'No active subscription found'
            });
        }

        const now = new Date();
        const isActive = subscription.end_date > now;

        // If expired, update status
        if (!isActive) {
            await subscription.update({ status: 'expired' });
        }

        res.json({
            success: true,
            is_premium_member: isActive,
            subscription: isActive ? subscription : null,
            expires_at: subscription.end_date,
            days_remaining: isActive ? Math.ceil((subscription.end_date - now) / (1000 * 60 * 60 * 24)) : 0
        });

    } catch (error) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch subscription'
        });
    }
});

// =================================================================
// --- FLASH SALES MANAGEMENT API ROUTES ---
// =================================================================

/**
 * @route   GET /api/subscriptions/flash-sales
 * @desc    Get active flash sales (for customers)
 * @access  Public
 */

// router.get('/flash-sales', async (req, res) => {
//     try {
//         const now = new Date();

//         const flashSales = await FlashSale.findAll({
//             where: {
//                 status: 'active',
//                 start_time: { [Op.lte]: now },
//                 end_time: { [Op.gt]: now }
//             },
//             include: [{
//                 model: FlashSaleTier,
//                 as: 'tiers',
//                 where: {
//                     is_active: true,
//                     used_count: { [Op.lt]: sequelize.col('member_limit') }
//                 },
//                 required: false,
//                 order: [['tier_order', 'ASC']]
//             }],
//             order: [['created_at', 'DESC']]
//         });

//         res.json({
//             success: true,
//             flash_sales: flashSales
//         });

//     } catch (error) {
//         console.error('Error fetching flash sales:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to fetch flash sales'
//         });
//     }
// });

/**
 * @route   POST /api/subscriptions/apply-flash-code
 * @desc    Apply flash sale promo code (member-only)
 * @access  Private
 */

// router.post('/apply-flash-code', authMiddleware, async (req, res) => {
//     const transaction = await sequelize.transaction();

//     try {
//         const userId = req.user.id;
//         const { code } = req.body;

//         if (!code) {
//             await transaction.rollback();
//             return res.status(400).json({
//                 success: false,
//                 message: 'Promo code is required'
//             });
//         }

//         // Check if user is a premium member
//         const subscription = await Subscription.findOne({
//             where: {
//                 user_id: userId,
//                 status: 'active',
//                 end_date: { [Op.gt]: new Date() }
//             }
//         });

//         if (!subscription) {
//             await transaction.rollback();
//             return res.status(403).json({
//                 success: false,
//                 message: 'Premium membership required to use flash sale codes'
//             });
//         }

//         // Find active flash sale
//         const now = new Date();
//         const flashSale = await FlashSale.findOne({
//             where: {
//                 code: code.toUpperCase(),
//                 status: 'active',
//                 start_time: { [Op.lte]: now },
//                 end_time: { [Op.gt]: now }
//             },
//             include: [{
//                 model: FlashSaleTier,
//                 as: 'tiers',
//                 where: { is_active: true },
//                 order: [['tier_order', 'ASC']]
//             }]
//         });

//         if (!flashSale) {
//             await transaction.rollback();
//             return res.status(404).json({
//                 success: false,
//                 message: 'Invalid or expired flash sale code'
//             });
//         }

//         // Check if user already used this flash sale
//         const existingUsage = await FlashSaleUsage.findOne({
//             where: {
//                 flash_sale_id: flashSale.id,
//                 user_id: userId
//             }
//         });

//         if (existingUsage) {
//             await transaction.rollback();
//             return res.status(400).json({
//                 success: false,
//                 message: 'You have already used this flash sale code'
//             });
//         }

//         // Find available tier (first tier with available slots)
//         let availableTier = null;
//         for (const tier of flashSale.tiers) {
//             if (tier.used_count < tier.member_limit) {
//                 availableTier = tier;
//                 break;
//             }
//         }

//         if (!availableTier) {
//             await transaction.rollback();
//             return res.status(400).json({
//                 success: false,
//                 message: 'Flash sale is fully utilized. No more discounts available.'
//             });
//         }

//         // Record usage
//         const usage = await FlashSaleUsage.create({
//             flash_sale_id: flashSale.id,
//             tier_id: availableTier.id,
//             user_id: userId,
//             discount_applied: availableTier.discount_percent,
//             used_at: new Date()
//         }, { transaction });

//         // Increment used count
//         await availableTier.increment('used_count', { transaction });

//         // Check if tier is now full and deactivate if needed
//         if (availableTier.used_count + 1 >= availableTier.member_limit) {
//             await availableTier.update({ is_active: false }, { transaction });
//         }

//         await transaction.commit();

//         res.json({
//             success: true,
//             message: `Congratulations! You got ${availableTier.discount_percent}% discount!`,
//             discount_percent: availableTier.discount_percent,
//             tier_name: availableTier.tier_name,
//             flash_sale_name: flashSale.name,
//             usage_id: usage.id
//         });

//     } catch (error) {
//         await transaction.rollback();
//         console.error('Error applying flash code:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to apply flash sale code'
//         });
//     }
// });


module.exports = router;
