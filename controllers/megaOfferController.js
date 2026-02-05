const {
    MegaOfferFestival,
    MegaOfferTier,
    MegaOfferParticipant,
    MegaOfferTierEntry,
    User,
    Subscription,
    sequelize
} = require('../models/models');
const { Op } = require('sequelize');

// Admin: Create a new Festival
exports.createFestival = async (req, res) => {
    try {
        const {
            name,
            description,
            start_time,
            end_time,
            pre_booking_start_time,
            pre_booking_end_time,
            pre_booking_amount,
            pre_booking_type
        } = req.body;

        const festival = await MegaOfferFestival.create({
            name,
            description,
            start_time,
            end_time,
            pre_booking_start_time,
            pre_booking_end_time,
            pre_booking_amount,
            pre_booking_type
        });

        res.status(201).json({ success: true, data: festival });
    } catch (error) {
        console.error('Error creating festival:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Admin: Add Tier to Festival
exports.addTier = async (req, res) => {
    try {
        const { festivalId } = req.params;
        const { tier_name, tier_order, entry_fee, discount_percent, max_winners, start_time, end_time, status } = req.body;

        const tier = await MegaOfferTier.create({
            festival_id: festivalId,
            tier_name,
            tier_order,
            entry_fee,
            discount_percent,
            max_winners,
            start_time,
            end_time,
            status: status || 'pending'
        });

        res.status(201).json({ success: true, data: tier });
    } catch (error) {
        console.error('Error adding tier:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Admin: Update Tier
exports.updateTier = async (req, res) => {
    try {
        const { tierId } = req.params;
        const { tier_name, tier_order, entry_fee, discount_percent, max_winners, start_time, end_time, status } = req.body;

        const tier = await MegaOfferTier.findByPk(tierId);
        if (!tier) {
            return res.status(404).json({ success: false, message: 'Tier not found' });
        }

        // Helper to ensure IST if no timezone provided
        const toIST = (dateStr) => {
            if (!dateStr) return null;
            // If it's just YYYY-MM-DDTHH:mm, append +05:30
            if (dateStr.length === 16) return new Date(dateStr + '+05:30');
            return new Date(dateStr);
        };

        await tier.update({
            tier_name,
            tier_order,
            entry_fee,
            discount_percent,
            max_winners,
            start_time: toIST(start_time),
            end_time: toIST(end_time),
            status
        });

        res.status(200).json({ success: true, data: tier, message: 'Tier updated successfully' });
    } catch (error) {
        console.error('Error updating tier:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// User: Create Razorpay Order for Pre-booking
exports.createPreBookingOrder = async (req, res) => {
    try {
        const { festivalId, productId } = req.body;
        const userId = req.user.id;

        // 1. Check if User is Prime
        const activeSubscription = await Subscription.findOne({
            where: {
                user_id: userId,
                status: 'active',
                end_date: { [Op.gt]: new Date() }
            }
        });

        if (!activeSubscription) {
            return res.status(403).json({ success: false, message: 'Only Prime members can pre-book.' });
        }

        // 2. Validate Festival
        const festival = await MegaOfferFestival.findByPk(festivalId);
        if (!festival) {
            return res.status(404).json({ success: false, message: 'Festival not found.' });
        }

        const now = new Date();
        if (now < festival.pre_booking_start_time || now > festival.pre_booking_end_time) {
            return res.status(400).json({ success: false, message: 'Pre-booking is not active.' });
        }

        // 3. Calculate Amount
        let amount = 0;
        if (productId) {
            const { Product, ProductVariant } = require('../models/models');
            const product = await Product.findByPk(productId, {
                include: [{ model: ProductVariant, as: 'variants' }]
            });

            if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

            // Get price from first variant (or logic to pick specific one)
            // Since Product table has no price, we must use variant price.
            let price = 0;
            if (product.variants && product.variants.length > 0) {
                price = parseFloat(product.variants[0].price);
            } else {
                // Fallback or error if no variants? 
                // If percentage based, we need a price.
                if (festival.pre_booking_type === 'percentage') {
                    return res.status(400).json({ success: false, message: 'Product has no price/variants available for calculation.' });
                }
            }

            if (festival.pre_booking_type === 'percentage') {
                amount = (price * parseFloat(festival.pre_booking_amount)) / 100;
            } else {
                amount = parseFloat(festival.pre_booking_amount);
            }
        } else {
            if (festival.pre_booking_type === 'percentage') {
                return res.status(400).json({ success: false, message: 'Product ID required' });
            }
            amount = parseFloat(festival.pre_booking_amount);
        }

        // 4. Create Razorpay Order
        const razorpay = require('../config/razorpay');
        const options = {
            amount: Math.round(amount * 100), // paise
            currency: "INR",
            receipt: `prebook_${festivalId}_${userId}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            order,
            key: "rzp_live_SAWrANbkbWONmt", // Fallback for dev
            amount: amount
        });

    } catch (error) {
        console.error('Error creating pre-booking order:', error);
        res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
};

// User: Pre-book (Verify Payment & Confirm)
exports.preBook = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { festivalId, productId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const userId = req.user.id;

        // 1. Verify Payment Signature
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Payment details missing' });
        }

        const crypto = require('crypto');
        const secret = "SbJ3eWEcqonP3rgN3z1jb4NX"; // Fallback for dev
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(body.toString())
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // 2. Check if User is Prime (Redundant check but safe)
        const activeSubscription = await Subscription.findOne({
            where: { user_id: userId, status: 'active', end_date: { [Op.gt]: new Date() } }
        });
        if (!activeSubscription) {
            await t.rollback();
            return res.status(403).json({ success: false, message: 'Membership expired' });
        }

        // 3. Check if already pre-booked
        const whereClause = { festival_id: festivalId, user_id: userId };
        if (productId) whereClause.product_id = productId;

        const existingParticipant = await MegaOfferParticipant.findOne({ where: whereClause });
        if (existingParticipant) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Already pre-booked for this item.' });
        }

        // 4. Create Participant Record
        // We can verify amount from razorpay order if needed, but for now we trust the flow as signature is verified

        // Fetch amount for record
        const festival = await MegaOfferFestival.findByPk(festivalId);
        let calculatedAmount = 0;
        // Reuse calculation logic roughly or store from payment order fetch? 
        // For simplicity, we recalculate or just accept it was correct since we created the order.

        // Recalculate for DB record
        if (productId) {
            const { Product, ProductVariant } = require('../models/models');
            const product = await Product.findByPk(productId, {
                include: [{ model: ProductVariant, as: 'variants' }]
            });

            if (festival.pre_booking_type === 'percentage') {
                let price = 0;
                if (product && product.variants && product.variants.length > 0) {
                    price = parseFloat(product.variants[0].price);
                }
                calculatedAmount = (price * parseFloat(festival.pre_booking_amount)) / 100;
            } else {
                calculatedAmount = parseFloat(festival.pre_booking_amount);
            }
        } else {
            calculatedAmount = parseFloat(festival.pre_booking_amount);
        }

        const participant = await MegaOfferParticipant.create({
            festival_id: festivalId,
            user_id: userId,
            product_id: productId || null,
            has_pre_booked: true,
            pre_booking_amount_paid: calculatedAmount,
            status: 'registered',
            payment_reference: razorpay_payment_id // Assuming models supports this or we add it (MegaOfferParticipant doesn't have it explicitly in models list but likely useful)
        }, { transaction: t });

        await t.commit();
        res.status(201).json({ success: true, message: 'Pre-booking successful', data: participant });

    } catch (error) {
        await t.rollback();
        console.error('Error pre-booking:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// User: Create Razorpay Order for Tier Join
exports.createTierJoinOrder = async (req, res) => {
    try {
        const { tierId } = req.body;
        const userId = req.user.id;

        const tier = await MegaOfferTier.findByPk(tierId);
        if (!tier) return res.status(404).json({ success: false, message: 'Tier not found' });

        if (tier.status !== 'active') return res.status(400).json({ success: false, message: 'Tier is not active' });

        const amount = parseFloat(tier.entry_fee);

        const razorpay = require('../config/razorpay');
        const options = {
            amount: Math.round(amount * 100), // paise
            currency: "INR",
            receipt: `tier_${tierId}_${userId}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            order,
            key: "rzp_live_SAWrANbkbWONmt",
            amount: amount,
            tierId: tierId
        });

    } catch (error) {
        console.error('Error creating tier join order:', error);
        res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
};

// User: Join Tier (Must have pre-booked)
exports.joinTier = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        console.log("joinTier Request Body:", req.body);
        const { tierId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const userId = req.user.id;

        const tier = await MegaOfferTier.findByPk(tierId, {
            include: [{ model: MegaOfferFestival, as: 'festival' }]
        });

        if (!tier) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Tier not found.' });
        }

        // 1. Check if user pre-booked for this festival
        const participant = await MegaOfferParticipant.findOne({
            where: { festival_id: tier.festival_id, user_id: userId, has_pre_booked: true }
        });

        if (!participant) {
            await t.rollback();
            return res.status(403).json({ success: false, message: 'You must pre-book to join tiers.' });
        }

        // 1.1 Check if user has already won a tier in this festival
        if (participant.status === 'won') {
            await t.rollback();
            return res.status(403).json({ success: false, message: 'You have already won a tier! You cannot join more tiers.' });
        }

        // 1.2 Verify Payment Signature
        if (razorpay_payment_id) { // Ensure payment details are present
            const crypto = require('crypto');
            const hmac = crypto.createHmac('sha256', "SbJ3eWEcqonP3rgN3z1jb4NX");
            hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
            const generated_signature = hmac.digest('hex');

            console.log(`Verifying: ${generated_signature} vs ${razorpay_signature}`);

            if (generated_signature !== razorpay_signature) {
                console.error("Signature Mismatch!");
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Payment verification failed' });
            }
        } else {
            // For now require payment, but if legacy code allow free? No, tier entry usually paid.
            // If entry fee is 0, we might skip payment check, but assuming paid for now.
            if (parseFloat(tier.entry_fee) > 0) {
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Payment required for this tier.' });
            }
        }

        // 2. Check if already joined this tier
        const existingEntry = await MegaOfferTierEntry.findOne({
            where: { tier_id: tierId, user_id: userId }
        }, { transaction: t });

        if (existingEntry) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'You have already joined this tier.' });
        }

        // ... (check entry limit logic if any)

        // 3. Create Entry
        await MegaOfferTierEntry.create({
            tier_id: tierId,
            user_id: userId,
            entry_fee_paid: tier.entry_fee, // Assuming we want to record the meaningful amount
            status: 'entered' // Use status instead of payment_status if model differs
            // payment_reference: razorpay_payment_id // Remove if model doesn't support, checking model...
        }, { transaction: t });

        // Note: We don't update MegaOfferParticipant status until result is announced, 
        // OR we might update something if needed? 
        // Currently status remains 'registered' until won/lost.

        await t.commit();
        res.status(201).json({ success: true, message: 'Successfully joined tier.' });

    } catch (error) {
        await t.rollback();
        console.error('Error joining tier:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Admin: Announce Winners for a Tier
exports.announceWinners = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { tierId, winnerCount } = req.body; // manual override for winner count

        const tier = await MegaOfferTier.findByPk(tierId);
        if (!tier) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Tier not found.' });
        }

        const entries = await MegaOfferTierEntry.findAll({
            where: { tier_id: tierId, status: 'entered' }
        });

        if (entries.length === 0) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'No entries in this tier.' });
        }

        const countToSelect = winnerCount || tier.max_winners || Math.ceil(entries.length * 0.1); // Default 10% if not set

        // Shuffle and pick winners
        const shuffled = entries.sort(() => 0.5 - Math.random());
        const winners = shuffled.slice(0, countToSelect);
        const losers = shuffled.slice(countToSelect);

        // Update Winners
        for (const winner of winners) {
            winner.status = 'won';
            await winner.save({ transaction: t });

            // Update Participant Status
            await MegaOfferParticipant.update(
                { status: 'won', won_tier_id: tierId },
                { where: { user_id: winner.user_id, festival_id: tier.festival_id }, transaction: t }
            );
        }

        // Update Losers
        for (const loser of losers) {
            loser.status = 'lost';
            await loser.save({ transaction: t });

            // Check if they have lost ALL tiers to potentially trigger mystery gift logic later
            // For now, just mark this tier entry as lost.
        }

        tier.status = 'completed';
        await tier.save({ transaction: t });

        await t.commit();
        res.status(200).json({ success: true, message: `Winners announced. ${winners.length} winners selected.` });

    } catch (error) {
        await t.rollback();
        console.error('Error announcing winners:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Public: Get Active Festivals
exports.getActiveFestivals = async (req, res) => {
    try {
        const now = new Date();
        const festivals = await MegaOfferFestival.findAll({
            where: {
                status: { [Op.in]: ['scheduled', 'active'] },
                end_time: { [Op.gt]: now }
            },
            order: [['start_time', 'ASC']]
        });
        res.status(200).json({ success: true, data: festivals });
    } catch (error) {
        console.error('Error fetching active festivals:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Public: Get Festival Details
exports.getFestivalDetails = async (req, res) => {
    try {
        const { festivalId } = req.params;
        const festival = await MegaOfferFestival.findByPk(festivalId, {
            include: [{ model: MegaOfferTier, as: 'tiers', order: [['tier_order', 'ASC']] }]
        });

        if (!festival) {
            return res.status(404).json({ success: false, message: 'Festival not found.' });
        }

        // Auto-update tier statuses based on time
        // Use Indian Standard Time (IST) for comparison to match user input
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        let updated = false;

        if (festival.tiers && festival.tiers.length > 0) {
            for (const tier of festival.tiers) {
                let statusChanged = false;

                // Check for expiration
                if (tier.status !== 'completed' && tier.end_time && now > new Date(tier.end_time)) {
                    tier.status = 'completed';
                    statusChanged = true;
                }
                // Check for activation
                else if (tier.status === 'pending' && tier.start_time && now >= new Date(tier.start_time)) {
                    // Ensure we don't activate if it's already past end time (handled above, but good to be safe)
                    if (!tier.end_time || now < new Date(tier.end_time)) {
                        tier.status = 'active';
                        statusChanged = true;
                    }
                }

                if (statusChanged) {
                    await tier.save();
                    updated = true;
                }
            }
        }

        // If we updated any tier, we might want to reload to ensure consistency, 
        // but since we modified the instances in place, 'festival' should be up to date 
        // regarding the fields we changed.

        res.status(200).json({ success: true, data: festival });
    } catch (error) {
        console.error('Error fetching festival:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// User: Claim Mystery Gift (If lost all)
exports.claimMysteryGift = async (req, res) => {
    try {
        const { festivalId } = req.body;
        const userId = req.user.id;

        const participant = await MegaOfferParticipant.findOne({
            where: { festival_id: festivalId, user_id: userId }
        });

        if (!participant) {
            return res.status(404).json({ success: false, message: 'Participation not found.' });
        }

        // Check if an order already exists
        const { MegaOfferOrder } = require('../models/models');
        const existingOrder = await MegaOfferOrder.findOne({
            where: {
                user_id: userId,
                festival_id: festivalId,
                payment_status: 'paid'
            }
        });

        if (existingOrder) {
            return res.status(400).json({ success: false, message: 'You have already placed an order for this offer.' });
        }

        if (participant.status !== 'won' && !participant.mystery_gift_claimed) {
            return res.status(400).json({ success: false, message: 'You are not eligible to pay yet.' });
        }

        if (participant.status === 'won') {
            return res.status(400).json({ success: false, message: 'You won a tier! No mystery gift for you.' });
        }

        // Check if user has entered at least one tier
        const entriesCount = await MegaOfferTierEntry.count({
            where: { tier_id: { [Op.in]: sequelize.literal(`(SELECT id FROM mega_offer_tiers WHERE festival_id = ${festivalId})`) }, user_id: userId }
        });

        if (entriesCount === 0) {
            return res.status(400).json({ success: false, message: 'You must participate in at least one tier to be eligible.' });
        }

        // Check if all tiers are completed
        const tiers = await MegaOfferTier.findAll({ where: { festival_id: festivalId } });
        const allTiersCompleted = tiers.every(t => t.status === 'completed');

        if (!allTiersCompleted) {
            return res.status(400).json({ success: false, message: 'Wait for all tiers to finish.' });
        }

        if (participant.mystery_gift_claimed) {
            return res.status(400).json({ success: false, message: 'Already claimed.' });
        }

        // Grant Mystery Gift Logic here (e.g. create a special order or coupon)

        participant.mystery_gift_claimed = true;
        await participant.save();

        res.status(200).json({ success: true, message: 'Mystery Gift Claimed! Check your rewards.' });

    } catch (error) {
        console.error('Error claiming gift:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// User: Get Participation Details
exports.getParticipation = async (req, res) => {
    try {
        const { festivalId } = req.params;
        const userId = req.user.id;
        const { Product, ProductVariant, ProductMedia } = require('../models/models');
        const participant = await MegaOfferParticipant.findOne({
            where: { festival_id: festivalId, user_id: userId },
            include: [
                {
                    model: Product,
                    as: 'product',
                    include: [
                        { model: ProductVariant, as: 'variants' }, // Fetch variants to get price
                        { model: ProductMedia, as: 'media' }     // Fetch images
                    ]
                }
            ]
        });

        console.log(`[getParticipation] FestivalId: ${festivalId}, UserId: ${userId}`);
        if (participant) {
            console.log(`[getParticipation] Found participant:`, JSON.stringify(participant, null, 2));
        } else {
            console.log(`[getParticipation] No participant found.`);
        }

        // Fetch Mega Offer Orders for this user and festival to check if "Order Placed"
        const { MegaOfferOrder } = require('../models/models');
        const orders = await MegaOfferOrder.findAll({
            where: {
                user_id: userId,
                festival_id: festivalId,
                payment_status: 'paid'
            }
        });

        if (!participant) {
            // Not an error, just no participation
            return res.status(200).json({ success: true, data: null });
        }

        // Fetch all tier entries for this user for this festival's tiers
        const { MegaOfferTier, MegaOfferTierEntry } = require('../models/models'); // Ensure models are available
        const tierEntries = await MegaOfferTierEntry.findAll({
            where: { user_id: userId },
            include: [{
                model: MegaOfferTier,
                as: 'tier',
                where: { festival_id: festivalId },
                attributes: [] // We just need to filter by festival, don't need tier data here again
            }]
        });

        // Convert to plain object to attach custom property
        const participantData = participant.toJSON();
        participantData.tier_entries = tierEntries;
        participantData.orders = orders; // Attach orders

        res.status(200).json({ success: true, data: participantData });

    } catch (error) {
        console.error('Error fetching participation:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// User: Create Pay Remaining Order (Winner)
exports.createPayRemainingOrder = async (req, res) => {
    try {
        const { festivalId } = req.body;
        const userId = req.user.id;

        const { Product, ProductVariant, MegaOfferFestival, MegaOfferTier } = require('../models/models');

        // 1. Get Participation
        const { Op } = require('sequelize');
        const participant = await MegaOfferParticipant.findOne({
            where: {
                festival_id: festivalId,
                user_id: userId,
                [Op.or]: [
                    { status: 'won' },
                    { mystery_gift_claimed: true }
                ]
            },
            include: [{ model: Product, as: 'product', include: [{ model: ProductVariant, as: 'variants' }] }]
        });

        if (!participant) return res.status(403).json({ success: false, message: 'You have not won this festival or claimed a mystery gift.' });

        // 2. Get Festival & Tier Info
        const festival = await MegaOfferFestival.findByPk(festivalId, {
            include: [{ model: MegaOfferTier, as: 'tiers' }]
        });

        const wonTier = festival.tiers.find(t => t.id === participant.won_tier_id);
        const productPrice = parseFloat(participant.product.variants[0].price);
        const prePaid = parseFloat(participant.pre_booking_amount_paid);
        const discountPercent = wonTier ? parseFloat(wonTier.discount_percent) : 0;
        const discountAmount = (productPrice * discountPercent) / 100;

        const remainingAmount = Math.max(0, productPrice - prePaid - discountAmount);

        if (remainingAmount <= 0) {
            return res.json({ success: true, amount: 0, message: "No payment needed" });
        }

        const razorpay = require('../config/razorpay');
        const options = {
            amount: Math.round(remainingAmount * 100), // paise
            currency: "INR",
            receipt: `claim_${festivalId}_${userId}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        res.json({
            success: true,
            order,
            key: "rzp_live_SAWrANbkbWONmt",
            amount: remainingAmount,
            details: {
                original_price: productPrice,
                pre_booking: prePaid,
                discount: discountAmount,
                final_to_pay: remainingAmount
            }
        });

    } catch (error) {
        console.error('Error creating remaining payment order:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// User: Confirm Pay Remaining & Create Sale Order
exports.confirmPayRemaining = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { festivalId, razorpay_payment_id, razorpay_order_id, razorpay_signature, amount_paid, phone_number } = req.body;
        const userId = req.user.id;
        const { Product, ProductVariant, MegaOfferFestival, MegaOfferTier, MegaOfferOrder, User } = require('../models/models');

        const { Op } = require('sequelize');
        const participant = await MegaOfferParticipant.findOne({
            where: {
                festival_id: festivalId,
                user_id: userId,
                [Op.or]: [
                    { status: 'won' },
                    { mystery_gift_claimed: true }
                ]
            },
            include: [{ model: Product, as: 'product', include: [{ model: ProductVariant, as: 'variants' }] }]
        });

        if (!participant) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Participation not found' });
        }

        // 1. Verify Payment (if amount > 0)
        if (amount_paid > 0) {
            const crypto = require('crypto');
            const hmac = crypto.createHmac('sha256', "SbJ3eWEcqonP3rgN3z1jb4NX");
            hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
            const generated_signature = hmac.digest('hex');

            if (generated_signature !== razorpay_signature) {
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Payment verification failed' });
            }
        }

        // 2. Calculate Final Details for Record
        const festival = await MegaOfferFestival.findByPk(festivalId, { include: [{ model: MegaOfferTier, as: 'tiers' }] });
        const wonTier = festival.tiers.find(t => t.id === participant.won_tier_id);
        const productPrice = parseFloat(participant.product.variants[0].price);
        const prePaid = parseFloat(participant.pre_booking_amount_paid);
        const discountPercent = wonTier ? parseFloat(wonTier.discount_percent) : 0;
        const discountAmount = (productPrice * discountPercent) / 100;

        // 2.5 Update User Phone if provided
        if (phone_number) {
            await User.update({ phone_number }, { where: { id: userId }, transaction: t });
        }

        // 3. Create MegaOfferOrder (Sale Order)
        await MegaOfferOrder.create({
            user_id: userId,
            festival_id: festivalId,
            product_id: participant.product_id,
            order_type: participant.status === 'won' ? 'win_claim' : 'mystery_gift',
            original_price: productPrice,
            pre_booking_amount: prePaid,
            discount_amount: discountAmount,
            final_amount_paid: amount_paid || 0,
            payment_status: 'paid',
            payment_reference: razorpay_payment_id,
            shipping_status: 'processing'
        }, { transaction: t });

        // Update participant to indicate claimed? (optional if using order table)

        await t.commit();
        res.status(201).json({ success: true, message: 'Order created successfully! Your product will be shipped.' });

    } catch (error) {
        await t.rollback();
        console.error('Error confirming remaining order:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// User: Get All My Participations (Festival IDs)
exports.getMyParticipations = async (req, res) => {
    try {
        const userId = req.user.id;
        const participations = await MegaOfferParticipant.findAll({
            where: { user_id: userId, has_pre_booked: true },
            attributes: ['festival_id']
        });

        const festivalIds = participations.map(p => p.festival_id);
        res.status(200).json({ success: true, data: festivalIds });
    } catch (error) {
        console.error('Error fetching my participations:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
