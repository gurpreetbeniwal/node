const express = require('express');
const router = express.Router();
const megaOfferController = require('../controllers/megaOfferController');
const adminAuth = require('../middleware/adminAuth');
const authMiddleware = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminAuth');
// User (Protected) - All authenticated users can access
router.post('/pre-book/create-order', authMiddleware, megaOfferController.createPreBookingOrder);
router.post('/tier/create-order', authMiddleware, megaOfferController.createTierJoinOrder); // New route
router.post('/pay-remaining/create-order', authMiddleware, megaOfferController.createPayRemainingOrder);
router.post('/pay-remaining/confirm', authMiddleware, megaOfferController.confirmPayRemaining);
router.post('/pre-book', authMiddleware, megaOfferController.preBook);
router.post('/join-tier', authMiddleware, megaOfferController.joinTier);
router.post('/claim-gift', authMiddleware, megaOfferController.claimMysteryGift);
router.get('/my-participations', authMiddleware, megaOfferController.getMyParticipations); // Specific route first

// Public with params (must be last or after specific routes)
router.get('/active', megaOfferController.getActiveFestivals);
router.get('/:festivalId/participation', authMiddleware, megaOfferController.getParticipation);
router.get('/:festivalId', megaOfferController.getFestivalDetails);

// Admin (Protected)
router.post('/create', adminAuth, megaOfferController.createFestival);// Tiers
router.post('/:festivalId/tier', adminAuth, megaOfferController.addTier);
router.put('/tier/:tierId', adminAuth, megaOfferController.updateTier); // New route for updating tier
router.post('/announce-winners', adminAuth, megaOfferController.announceWinners);

module.exports = router;
