const { Op } = require('sequelize');
const { sequelize, SubscriptionPlan, Subscription, Influencer, SubscriptionPurchase } = require('../models/models');
const razorpay = require('../config/razorpay');
const crypto = require('crypto');

/**
 * Purchase a subscription plan
 */
exports.purchaseSubscription = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        // Handle both req.user (from middleware) and direct userId (for testing)
        const userId = req.user ? req.user.id : req.body.user_id;
        const { plan_id, payment_reference, referralCode, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        if (!userId) {
            await transaction.rollback();
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        if (!plan_id) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Plan ID is required'
            });
        }

        // Check if plan exists
        const plan = await SubscriptionPlan.findOne({
            where: { id: plan_id, is_active: true }
        });

        if (!plan) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Subscription plan not found'
            });
        }

        // Check if user already has an active subscription
        const existingSubscription = await Subscription.findOne({
            where: {
                user_id: userId,
                status: 'active',
                end_date: { [Op.gt]: new Date() }
            }
        });

        if (existingSubscription) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'You already have an active subscription'
            });
        }

        // --- Referral Logic ---
        let discountPercent = 0;
        let discountAmount = 0;
        let influencerId = null;
        let validReferralCode = null;

        if (referralCode) {
            const influencer = await Influencer.findOne({
                where: {
                    referral_code: referralCode,
                    is_active: true
                }
            });

            if (influencer) {
                discountPercent = influencer.discount_percent;
                influencerId = influencer.id;
                validReferralCode = influencer.referral_code;

                // Calculate discount
                discountAmount = (parseFloat(plan.price) * discountPercent) / 100;
            }
        }

        // ✅ Verify Razorpay Signature if online payment
        if (razorpay_payment_id) {
            const secret = "SbJ3eWEcqonP3rgN3z1jb4NX"; // Using test key as requested
            // const secret = process.env.RAZORPAY_KEY_SECRET;

            const body = razorpay_order_id + "|" + razorpay_payment_id;

            const generated_signature = crypto
                .createHmac('sha256', secret)
                .update(body.toString())
                .digest('hex');

            if (generated_signature !== razorpay_signature) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Payment verification failed: Invalid signature'
                });
            }
        }

        const basePrice = parseFloat(plan.price);
        const finalPrice = basePrice - discountAmount;

        // Create Purchase Record
        const purchase = await SubscriptionPurchase.create({
            user_id: userId,
            plan_id: plan_id,
            base_price: basePrice,
            discount_applied: discountAmount,
            final_price: finalPrice,
            influencer_id: influencerId,
            referral_code: validReferralCode,
            purchased_at: new Date()
        }, { transaction });

        // Create new subscription
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + plan.duration_days);

        const subscription = await Subscription.create({
            user_id: userId,
            plan_id: plan_id,
            start_date: startDate,
            end_date: endDate,
            status: 'active',
            payment_reference: payment_reference || null
        }, { transaction });

        await transaction.commit();

        const subscriptionWithPlan = await Subscription.findByPk(subscription.id, {
            include: [{
                model: SubscriptionPlan,
                as: 'plan'
            }]
        });

        res.status(201).json({
            success: true,
            message: 'Subscription purchased successfully',
            subscription: subscriptionWithPlan,
            purchase_details: {
                base_price: basePrice,
                discount_applied: discountAmount,
                final_price: finalPrice,
                referral_code: validReferralCode
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Error purchasing subscription:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to purchase subscription'
        });
    }
};

/**
 * Create Razorpay Order for Subscription
 */
exports.createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { plan_id, referralCode } = req.body;

        if (!plan_id) {
            return res.status(400).json({ success: false, message: 'Plan ID is required' });
        }

        const plan = await SubscriptionPlan.findByPk(plan_id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }

        // Calculate price with discount
        let finalPrice = parseFloat(plan.price);

        if (referralCode) {
            const influencer = await Influencer.findOne({
                where: { referral_code: referralCode, is_active: true }
            });
            if (influencer) {
                const discountAmount = (finalPrice * influencer.discount_percent) / 100;
                finalPrice -= discountAmount;
            }
        }

        const options = {
            amount: Math.round(finalPrice * 100), // amount in paise
            currency: "INR",
            receipt: `sub_receipt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            order,
            key: "rzp_live_SAWrANbkbWONmt", // Using test key
            // key: process.env.RAZORPAY_KEY_ID,
            final_price: finalPrice
        });

    } catch (error) {
        console.error('Error creating subscription order:', error);
        res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
};
