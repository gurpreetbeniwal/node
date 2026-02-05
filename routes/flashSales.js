const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/authMiddleware');
const { sequelize, SubscriptionPlan, Subscription, FlashSale, FlashSaleTier, FlashSaleUsage, User } = require('../models/models');

// =================================================================
// --- FLASH SALE API ROUTES ---
// =================================================================

/**
 * @route   GET /api/flash-sales/active
 * @desc    Get all active flash sales with tiers
 * @access  Public
 */
router.get('/active', async (req, res) => {
    try {
        console.log('🔍 Fetching active flash sales...');
        const now = new Date();
        
        // First, let's see what columns actually exist
        const testQuery = await FlashSale.findAll({ limit: 1 });
        console.log('🔍 Sample FlashSale record:', testQuery[0]?.toJSON());
        
        // Use the correct column names based on your database structure
        const activeFlashSales = await FlashSale.findAll({
            where: {
                status: 'active', // Using 'status' instead of 'is_active'
                start_time: { [Op.lte]: now },
                end_time: { [Op.gte]: now }
            },
            // Remove the include for now to test basic functionality
            order: [['start_time', 'DESC']]
        });

        console.log('⚡ Found active flash sales:', activeFlashSales.length);

        // Transform the data to match expected format
        const transformedSales = activeFlashSales.map(sale => ({
            id: sale.id,
            name: sale.name,
            code: sale.code,
            description: sale.description,
            start_time: sale.start_time,
            end_time: sale.end_time,
            status: sale.status,
            is_members_only: sale.is_members_only,
            created_at: sale.created_at,
            updated_at: sale.updated_at,
            tiers: [] // We'll add tiers in the next step
        }));

        res.json({
            success: true,
            flash_sales: transformedSales,
            count: transformedSales.length,
            message: transformedSales.length === 0 ? 'No active flash sales found' : undefined
        });

    } catch (error) {
        console.error('❌ Error fetching flash sales:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active flash sales',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});



/**
 * @route   POST /api/flash-sales/apply
 * @desc    Apply flash sale code (Premium members only)
 * @access  Private
 */
// POST /api/flash-sales/apply
// router.post('/apply', authMiddleware, async (req, res) => {
//   const transaction = await sequelize.transaction();
//   try {
//     const userId = req.user.id;
//     const { code } = req.body;
//     if (!code?.trim()) {
//       await transaction.rollback();
//       return res.status(400).json({ success: false, message: 'Flash sale code is required' });
//     }

//     // Ensure premium subscription
//     const subscription = await Subscription.findOne({
//       where: { user_id: userId, status: 'active', end_date: { [Op.gt]: new Date() } },
//       transaction
//     });
//     if (!subscription) {
//       await transaction.rollback();
//       return res.status(403).json({ success: false, message: 'Premium membership required' });
//     }

//     // Find sale with tiers
//     const now = new Date();
//     const flashSale = await FlashSale.findOne({
//       where: {
//         code: code.toUpperCase().trim(),
//         status: 'active',
//         start_time: { [Op.lte]: now },
//         end_time: { [Op.gte]: now }
//       },
//       include: [{
//         model: FlashSaleTier,
//         as: 'tiers',
//         where: { is_active: true },
//         order: [['tier_order', 'ASC']]
//       }],
//       transaction
//     });
//     if (!flashSale) {
//       await transaction.rollback();
//       return res.status(404).json({ success: false, message: 'Invalid or expired flash sale code' });
//     }

//     // Pick first tier with remaining slots
//     const tier = flashSale.tiers.find(t => t.used_count < t.member_limit);
//     if (!tier) {
//       await transaction.rollback();
//       return res.status(400).json({ success: false, message: 'No slots remaining' });
//     }

//     // Check prior usage
//     const existing = await FlashSaleUsage.findOne({
//       where: { user_id: userId, flash_sale_id: flashSale.id, tier_id: tier.id },
//       transaction
//     });
//     if (existing) {
//       if (existing.discount_applied === 0) {
//         // Already applied but not used
//         await transaction.rollback();
//         return res.status(200).json({
//           success: true,
//           message: 'Flash sale code already applied to cart',
//           usage_id: existing.id,
//           discount_percent: tier.discount_percent,
//           tier_name: tier.tier_name,
//           flash_sale_name: flashSale.name
//         });
//       } else {
//         // Already used in an order
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Flash sale code already used'
//         });
//       }
//     }

//     // Create new usage record with discount_applied = 0
//     const usage = await FlashSaleUsage.create({
//       user_id: userId,
//       flash_sale_id: flashSale.id,
//       tier_id: tier.id,
//       code_used: flashSale.code,
//       discount_applied: 0,
//       used_at: now
//     }, { transaction });

//     // Increment tier used_count
//     await tier.increment('used_count', { by: 1, transaction });

//     await transaction.commit();
//     return res.json({
//       success: true,
//       message: 'Flash sale code applied!',
//       usage_id: usage.id,
//       discount_percent: tier.discount_percent,
//       tier_name: tier.tier_name,
//       flash_sale_name: flashSale.name
//     });

//   } catch (err) {
//     await transaction.rollback();
//     console.error('Error applying flash sale:', err);
//     return res.status(500).json({ success: false, message: 'Failed to apply flash sale code' });
//   }
// });
router.post('/apply', authMiddleware, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const { code } = req.body;
    if (!code?.trim()) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Flash sale code is required' });
    }

    // Ensure premium subscription
    const subscription = await Subscription.findOne({
      where: { user_id: userId, status: 'active', end_date: { [Op.gt]: new Date() } },
      transaction
    });
    if (!subscription) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Premium membership required' });
    }

    // Find sale with tiers
    const now = new Date();
    const flashSale = await FlashSale.findOne({
      where: {
        code: code.toUpperCase().trim(),
        status: 'active',
        start_time: { [Op.lte]: now },
        end_time: { [Op.gte]: now }
      },
      include: [{
        model: FlashSaleTier,
        as: 'tiers',
        where: { is_active: true },
        order: [['tier_order', 'ASC']]
      }],
      transaction
    });
    if (!flashSale) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Invalid or expired flash sale code' });
    }

    // Pick first tier with remaining slots
    const tier = flashSale.tiers.find(t => t.used_count < t.member_limit);
    if (!tier) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No slots remaining' });
    }

    // Check prior usage
    const existing = await FlashSaleUsage.findOne({
      where: { user_id: userId, flash_sale_id: flashSale.id, tier_id: tier.id },
      transaction
    });
    if (existing) {
      if (existing.discount_applied === 0) {
        // Already applied but not used: return all data, usage info, tier, and sale name
        await transaction.rollback();
        return res.status(200).json({
          success: true,
          message: 'Flash sale code already applied to cart',
          usage_id: existing.id,
          discount_percent: tier.discount_percent,
          tier_name: tier.tier_name,
          flash_sale_name: flashSale.name,
          code_used: existing.code_used,
          discount_applied: existing.discount_applied,
          flash_sale_id: flashSale.id,
          tier_id: tier.id,
          used_at: existing.used_at,
        });
      } else {
        // Already used in an order
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Flash sale code already used'
        });
      }
    }

    // Create new usage record with discount_applied = 0
    const usage = await FlashSaleUsage.create({
      user_id: userId,
      flash_sale_id: flashSale.id,
      tier_id: tier.id,
      code_used: flashSale.code,
      discount_applied: 0,
      used_at: now
    }, { transaction });

    // Increment tier used_count
    await tier.increment('used_count', { by: 1, transaction });

    await transaction.commit();
    return res.json({
      success: true,
      message: 'Flash sale code applied!',
      usage_id: usage.id,
      discount_percent: tier.discount_percent,
      tier_name: tier.tier_name,
      flash_sale_name: flashSale.name,
      code_used: usage.code_used,
      discount_applied: usage.discount_applied,
      flash_sale_id: flashSale.id,
      tier_id: tier.id,
      used_at: usage.used_at,
    });

  } catch (err) {
    await transaction.rollback();
    console.error('Error applying flash sale:', err);
    return res.status(500).json({ success: false, message: 'Failed to apply flash sale code' });
  }
});








module.exports = router;
