const express = require('express');
const router = express.Router();
const db = require('../models/models');
const { User, Cart, CartItem, ProductReview, FlashSale, FlashSaleTier, FlashSaleUsage, ProductMedia, Product, ProductVariant, Address, Coupon, Order, OrderItem } = require('../models/models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const authMiddleware = require('../middleware/authMiddleware');
const { sequelize } = require('../models/models');
const razorpay = require('../config/razorpay');
const crypto = require('crypto');


// Initialize the Google Auth Client with your Client ID
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// =================================================================
// --- USER AUTHENTICATION & MANAGEMENT API ROUTES ---
// =================================================================

/**
 * @route   POST /api/users/register
 * @desc    Register a new user with email and password
 * @access  Public
 */
router.post('/register', async (req, res) => {
    const { first_name, last_name, email, password, phone_number } = req.body;

    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ message: 'Please enter all required fields.' });
    }

    try {
        // Check if a user with this email already exists
        const existingUser = await db.User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }

        // Hash the password for security
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Create the new user in the database
        const newUser = await db.User.create({
            first_name,
            last_name,
            email,
            phone_number: phone_number || null, // Optional
            password_hash
        });

        // Automatically create an empty cart for the new user
        await db.Cart.create({ user_id: newUser.id });

        // Create a JSON Web Token to log them in immediately
        const payload = { user: { id: newUser.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            token,
            user: {
                id: newUser.id,
                first_name: newUser.first_name,
                last_name: newUser.last_name,
                email: newUser.email,
                phone_number: newUser.phone_number,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

/**
 * @route   POST /api/users/login
 * @desc    Authenticate a user with email and password
 * @access  Public
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Please provide email and password.' });
    }

    try {
        // Find the user by their email
        const user = await db.User.findOne({ where: { email } });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // Compare the submitted password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // If credentials are correct, generate a JWT
        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                phone_number: user.phone_number,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

/**
 * @route   POST /api/users/forgot-password
 * @desc    Send OTP to user's email for password reset
 * @access  Public
 */
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Please provide your email address.' });
    }

    try {
        const user = await db.User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: 'User with this email does not exist.' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        user.otp = otp;
        user.otp_expires_at = otpExpiresAt;
        await user.save();

        const sendEmail = require('../utils/emailService');
        await sendEmail(
            email,
            'Password Reset OTP',
            `Your OTP for password reset is: ${otp}. It expires in 15 minutes.`,
            `<p>Your OTP for password reset is: <strong>${otp}</strong></p><p>It expires in 15 minutes.</p>`
        );

        res.json({ message: 'OTP sent to your email.' });

    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Server error processing request.' });
    }
});

/**
 * @route   POST /api/users/reset-password
 * @desc    Reset password using OTP
 * @access  Public
 */
router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: 'Please fill in all fields.' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match.' });
    }

    try {
        const user = await db.User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const { Op } = require('sequelize');
        // Validate OTP and Expiry
        if (user.otp !== otp || new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(newPassword, salt);

        // Clear OTP fields
        user.otp = null;
        user.otp_expires_at = null;
        await user.save();

        res.json({ message: 'Password reset successfully. You can now login.' });

    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server error resetting password.' });
    }
});


/**
 * @route   GET /api/users/profile
 * @desc    Get the profile of the currently logged-in user
 * @access  Private
 */
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        // The user ID is added to req.user by the authMiddleware
        const user = await db.User.findByPk(req.user.id, {
            attributes: { exclude: ['password_hash', 'otp', 'otp_expires_at'] }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(user);
    } catch (error) {
        console.error('Profile Fetch Error:', error);
        res.status(500).json({ message: 'Server error fetching profile.' });
    }
});

/**
 * @route   POST /api/users/google-signin
 * @desc    Authenticate a user via Google OAuth
 * @access  Public
 */
router.post('/google-signin', async (req, res) => {
    const { credential } = req.body; // The token sent from the frontend

    if (!credential) {
        return res.status(400).json({ message: 'Google credential not provided.' });
    }

    try {
        // Step 1: Verify the credential token with Google's servers
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        const { email, given_name, family_name, picture, sub: google_id } = payload;

        // Step 2: Find or create the user in your database
        let user = await db.User.findOne({ where: { email } });

        if (!user) {
            // If user doesn't exist, create a new one
            user = await db.User.create({
                first_name: given_name,
                last_name: family_name,
                email,
                google_id, // Store the unique Google ID
                avatar_url: picture,
                password_hash: null // No password needed for social logins
            });
            // Also create a cart for the new user
            await db.Cart.create({ user_id: user.id });
        } else {
            // If user exists, ensure their google_id and avatar are up-to-date
            if (!user.google_id) {
                await user.update({ google_id, avatar_url: picture });
            }
        }

        // Step 3: Create your application's own JWT for the user session
        const appPayload = { user: { id: user.id } };
        const token = jwt.sign(appPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Step 4: Send the token and user info back to the frontend
        res.json({
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Google Sign-In Error:', error);
        res.status(401).json({ message: 'Invalid Google credential. Please try again.' });
    }
});


router.put('/profile', authMiddleware, async (req, res) => {
    const { first_name, last_name, phone_number } = req.body;

    // Basic validation
    if (!first_name || !last_name) {
        return res.status(400).json({ message: 'First and last name are required.' });
    }

    try {
        const user = await db.User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        user.first_name = first_name;
        user.last_name = last_name;
        user.phone_number = phone_number || user.phone_number; // Only update if provided

        await user.save();
        res.json({ message: 'Profile updated successfully.', user });

    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ message: "Server error while updating profile." });
    }
});

// router.post('/change-password', authMiddleware, async (req, res) => {
//     const { currentPassword, newPassword, confirmPassword } = req.body;

//     if (!currentPassword || !newPassword || !confirmPassword) {
//         return res.status(400).json({ message: 'Please fill in all password fields.' });
//     }
//     if (newPassword !== confirmPassword) {
//         return res.status(400).json({ message: 'New passwords do not match.' });
//     }

//     try {
//         const user = await db.User.findByPk(req.user.id);
//         if (!user.password_hash) {
//              return res.status(400).json({ message: 'Cannot change password for social login accounts.' });
//         }

//         // Verify the current password
//         const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
//         if (!isMatch) {
//             return res.status(400).json({ message: 'Incorrect current password.' });
//         }

//         // Hash the new password
//         const salt = await bcrypt.genSalt(10);
//         user.password_hash = await bcrypt.hash(newPassword, salt);
//         await user.save();

//         res.json({ message: 'Password changed successfully.' });

//     } catch (error) {
//         console.error("Change password error:", error);
//         res.status(500).json({ message: "Server error while changing password." });
//     }
// });


router.post('/change-password', authMiddleware, async (req, res) => {
    console.log('🔥 Change Password Route Called');
    console.log('📥 Request Body:', req.body);
    console.log('👤 User from auth middleware:', req.user);
    console.log('⏰ Timestamp:', new Date().toISOString());

    const { currentPassword, newPassword, confirmPassword } = req.body;

    console.log('🔍 Extracted Data:', {
        currentPassword: currentPassword ? '***provided***' : 'missing',
        newPassword: newPassword ? '***provided***' : 'missing',
        confirmPassword: confirmPassword ? '***provided***' : 'missing'
    });

    if (!currentPassword || !newPassword || !confirmPassword) {
        console.log('❌ Validation Failed: Missing fields');
        return res.status(400).json({ message: 'Please fill in all password fields.' });
    }

    if (newPassword !== confirmPassword) {
        console.log('❌ Validation Failed: Passwords do not match');
        return res.status(400).json({ message: 'New passwords do not match.' });
    }

    console.log('✅ Initial validation passed');

    try {
        console.log('🔍 Looking up user with ID:', req.user.id);

        const user = await db.User.findByPk(req.user.id);

        console.log('👤 User found:', {
            id: user?.id,
            email: user?.email,
            hasPasswordHash: !!user?.password_hash,
            passwordHashLength: user?.password_hash?.length
        });

        if (!user) {
            console.log('❌ User not found in database');
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!user.password_hash) {
            console.log('❌ User has no password hash (social login account)');
            return res.status(400).json({ message: 'Cannot change password for social login accounts.' });
        }

        console.log('🔐 Verifying current password...');

        // Verify the current password
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

        console.log('🔐 Password verification result:', isMatch);

        if (!isMatch) {
            console.log('❌ Current password verification failed');
            return res.status(400).json({ message: 'Incorrect current password.' });
        }

        console.log('✅ Current password verified successfully');
        console.log('🔐 Generating new password hash...');

        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash(newPassword, salt);

        console.log('🔐 New password hash generated, length:', newPasswordHash.length);

        user.password_hash = newPasswordHash;

        console.log('💾 Saving user to database...');

        await user.save();

        console.log('✅ Password changed successfully in database');

        res.json({
            success: true,
            message: 'Password changed successfully.'
        });

        console.log('✅ Success response sent');

    } catch (error) {
        console.error("❌ Change password error:", error);
        console.error("❌ Error name:", error.name);
        console.error("❌ Error message:", error.message);
        console.error("❌ Error stack:", error.stack);

        res.status(500).json({ message: "Server error while changing password." });
    }
});



router.get('/addresses', authMiddleware, async (req, res) => {
    try {
        const addresses = await db.Address.findAll({
            where: { user_id: req.user.id },
            order: [['is_default', 'DESC']] // Show default address first
        });
        res.json(addresses);
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ message: "Server error." });
    }
});

/**
 * @route   POST /api/addresses
 * @desc    Add a new address for the logged-in user
 * @access  Private
 */
router.post('/addresses', authMiddleware, async (req, res) => {
    console.log('🔥 Add Address Route Called');
    console.log('📥 Request Body:', req.body);
    console.log('👤 User ID:', req.user.id);
    console.log('⏰ Timestamp:', new Date().toISOString());

    const { street_address, city, state, postal_code, country, phone_number, is_default } = req.body;

    // Add validation logging
    console.log('🔍 Validation Check:', {
        street_address: !!street_address,
        city: !!city,
        state: !!state,
        postal_code: !!postal_code,
        country: !!country,
        phone_number: !!phone_number
    });

    if (!street_address || !city || !state || !postal_code || !country || !phone_number) {
        console.log('❌ Validation Failed - Missing Fields');
        return res.status(400).json({
            message: "Please fill in all required address fields.",
            received_fields: { street_address, city, state, postal_code, country, phone_number }
        });
    }

    console.log('✅ Validation Passed');

    const t = await db.sequelize.transaction();
    try {
        console.log('🔄 Starting Transaction');

        if (is_default) {
            console.log('📍 Setting as default - updating other addresses');
            await db.Address.update({ is_default: false }, {
                where: { user_id: req.user.id },
                transaction: t
            });
        }

        console.log('➕ Creating new address');
        const newAddress = await db.Address.create({
            user_id: req.user.id,
            street_address,
            city,
            state,
            postal_code,
            country,
            phone_number,
            is_default: is_default || false
        }, { transaction: t });

        await t.commit();
        console.log('✅ Address Created Successfully:', newAddress.id);

        res.status(201).json({
            message: 'Address added successfully',
            address: newAddress
        });

    } catch (error) {
        await t.rollback();
        console.error("❌ Error adding address:", error);
        console.error("📋 Error Details:", {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        res.status(500).json({
            message: "Failed to add address.",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


/**
 * @route   PUT /api/addresses/:id
 * @desc    Update an address for the logged-in user
 * @access  Private
 */

router.put('/addresses/:id', authMiddleware, async (req, res) => {
    const { street_address, city, state, postal_code, country, phone_number, is_default } = req.body;
    const t = await db.sequelize.transaction();
    try {
        const address = await db.Address.findOne({ where: { id: req.params.id, user_id: req.user.id } });
        if (!address) {
            await t.rollback();
            return res.status(404).json({ message: "Address not found." });
        }

        // Handle the "is_default" logic
        if (is_default) {
            await db.Address.update({ is_default: false }, {
                where: { user_id: req.user.id },
                transaction: t
            });
        }
        await address.update({
            street_address, city, state, postal_code, country, phone_number, is_default
        }, { transaction: t });

        await t.commit();
        res.json(address);
    } catch (error) {
        await t.rollback();
        console.error("Error updating address:", error);
        res.status(500).json({ message: "Failed to update address." });
    }
});

/**
 * @route   DELETE /api/addresses/:id
 * @desc    Delete an address
 * @access  Private
 */

router.delete('/addresses/:id', authMiddleware, async (req, res) => {
    try {
        const address = await db.Address.findOne({ where: { id: req.params.id, user_id: req.user.id } });
        if (!address) {
            return res.status(404).json({ message: "Address not found." });
        }
        await address.destroy();
        res.json({ message: "Address deleted successfully." });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ message: "Failed to delete address." });
    }
});



router.get('/:productId/reviews', async (req, res) => {
    try {
        const { productId } = req.params;
        console.log('📝 Fetching reviews for product:', productId);

        // ✅ Only request columns that exist in your users table
        const reviews = await ProductReview.findAll({
            where: { product_id: productId },
            include: [
                {
                    model: User,
                    as: 'User',
                    // ✅ Only include columns that actually exist in your users table
                    attributes: ['id', 'first_name', 'last_name'], // Removed 'name'
                    required: false
                }
            ],
            order: [['created_at', 'DESC']]
        });

        // Calculate review statistics
        const totalReviews = reviews.length;
        const ratings = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let totalRating = 0;

        reviews.forEach(review => {
            ratings[review.rating]++;
            totalRating += review.rating;
        });

        const averageRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : 0;

        // ✅ Create display name from first_name and last_name only
        const transformedReviews = reviews.map(review => ({
            id: review.id,
            product_id: review.product_id,
            user_id: review.user_id,
            rating: review.rating,
            comment: review.comment,
            created_at: review.created_at,
            // ✅ Build name from first_name and last_name
            reviewer_name: review.User
                ? `${review.User.first_name || ''} ${review.User.last_name || ''}`.trim() || 'Anonymous'
                : 'Anonymous'
        }));

        const stats = {
            totalReviews,
            averageRating: parseFloat(averageRating),
            ratings
        };

        console.log('✅ Reviews found:', totalReviews);

        res.json({
            success: true,
            reviews: transformedReviews,
            stats
        });

    } catch (error) {
        console.error('❌ Error fetching reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews'
        });
    }
});


// Add a new review (requires authentication)
router.post('/:productId/reviews', authMiddleware, async (req, res) => {
    try {
        const { productId } = req.params;
        const { rating, comment } = req.body;
        const userId = req.user.id; // ✅ Get user ID from auth middleware

        console.log('📝 Adding review for product:', productId, {
            userId,
            rating,
            comment: comment.substring(0, 50) + '...' // Log partial comment for privacy
        });

        // Validate rating
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        if (!comment || comment.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Review comment must be at least 10 characters long'
            });
        }

        // ✅ Check if user already reviewed this product
        const existingReview = await ProductReview.findOne({
            where: {
                product_id: productId,
                user_id: userId
            }
        });

        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this product'
            });
        }

        // Check if product exists
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // ✅ Create review with only necessary fields
        const review = await ProductReview.create({
            product_id: productId,
            user_id: userId, // From authenticated user
            rating,
            comment: comment.trim()
        });

        console.log('✅ Review created:', review.id);

        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            review: {
                id: review.id,
                product_id: review.product_id,
                rating: review.rating,
                comment: review.comment,
                created_at: review.created_at,
                reviewer_name: req.user.name || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Anonymous'
            }
        });

    } catch (error) {
        console.error('❌ Error adding review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add review'
        });
    }
});





// ✅ Create Order
// ✅ Enhanced Create Order with Flash Sale Support
// router.post('/orders', authMiddleware, async (req, res) => {
//     console.log('🚀 Order creation started with flash sale support');

//     const transaction = await sequelize.transaction();

//     try {
//         const userId = req.user.id;
//         const { 
//             shipping_address_id,
//             subtotal_amount,
//             gst_amount,
//             shipping_charge,
//             total_amount,
//             payment_method,
//             contact_email,
//             contact_phone,
//             order_notes,
//             coupon_code,
//             coupon_discount,
//             // Flash sale fields
//             flash_sale_code,
//             flash_discount,
//             flash_usage_id
//         } = req.body;

//         console.log('📦 Creating order for user:', userId);
//         console.log('⚡ Flash sale data:', { flash_sale_code, flash_discount, flash_usage_id });

//         // Validate required fields
//         if (!contact_email || !contact_phone || !shipping_address_id) {
//             await transaction.rollback();
//             return res.status(400).json({
//                 success: false,
//                 message: 'Missing required information'
//             });
//         }

//         // Get cart items
//         const cart = await Cart.findOne({
//             where: { user_id: userId },
//             include: [{
//                 model: CartItem,
//                 include: [{
//                     model: ProductVariant,
//                     include: [{
//                         model: Product,
//                         include: [{ model: ProductMedia, limit: 1 }]
//                     }]
//                 }]
//             }],
//             transaction
//         });

//         if (!cart || !cart.CartItems || cart.CartItems.length === 0) {
//             await transaction.rollback();
//             return res.status(400).json({
//                 success: false,
//                 message: 'Cart is empty'
//             });
//         }

//         // Validate flash sale usage if provided
//         let flashSaleUsage = null;
//         if (flash_usage_id) {
//             flashSaleUsage = await FlashSaleUsage.findByPk(flash_usage_id, {
//                 include: [
//                     { model: FlashSale, as: 'flashSale' },
//                     { model: FlashSaleTier, as: 'tier' }
//                 ],
//                 transaction
//             });

//             if (!flashSaleUsage || flashSaleUsage.user_id !== userId) {
//                 await transaction.rollback();
//                 return res.status(400).json({
//                     success: false,
//                     message: 'Invalid flash sale usage'
//                 });
//             }

//             console.log('✅ Flash sale usage validated:', flashSaleUsage.id);
//         }

//         // Generate order number
//         const orderCount = await Order.count({ transaction }) + 1;
//         const orderNumber = `ORD${Date.now()}${orderCount.toString().padStart(3, '0')}`;

//         // Create order with flash sale data
//         const order = await Order.create({
//             user_id: userId,
//             order_number: orderNumber,
//             shipping_address_id: parseInt(shipping_address_id),
//             subtotal_amount: parseFloat(subtotal_amount),
//             gst_amount: parseFloat(gst_amount),
//             shipping_charge: parseFloat(shipping_charge),
//             total_amount: parseFloat(total_amount),
//             payment_method,
//             payment_status: payment_method === 'cod' ? 'pending' : 'pending',
//             order_status: 'pending',
//             contact_email,
//             contact_phone,
//             order_notes: order_notes || null,
//             coupon_code: coupon_code || null,
//             coupon_discount: coupon_discount ? parseFloat(coupon_discount) : 0,
//             // Flash sale fields
//             flash_sale_code: flash_sale_code || null,
//             flash_discount: flash_discount ? parseFloat(flash_discount) : 0,
//             flash_usage_id: flash_usage_id || null
//         }, { transaction });

//         console.log('✅ Order created:', order.order_number);

//         // Create order items
//         for (const cartItem of cart.CartItems) {
//             const variant = cartItem.ProductVariant;
//             const product = variant.Product;
//             const price = variant.sale_price || variant.price;

//             await OrderItem.create({
//                 order_id: order.id,
//                 product_variant_id: cartItem.product_variant_id,
//                 product_name: product.name,
//                 variant_sku: variant.sku,
//                 quantity: cartItem.quantity,
//                 price: price,
//                 total_price: price * cartItem.quantity
//             }, { transaction });

//             // Update stock
//             if (variant.stock_quantity !== null) {
//                 await variant.decrement('stock_quantity', {
//                     by: cartItem.quantity,
//                     transaction
//                 });
//             }
//         }

//         // Clear cart
//         await CartItem.destroy({
//             where: { cart_id: cart.id },
//             transaction
//         });

//         // If flash sale was used, mark the usage as used in order
//         if (flashSaleUsage) {
//             await flashSaleUsage.update({
//                 used_in_order_id: order.id,
//                 used_at: new Date()
//             }, { transaction });

//             console.log('✅ Flash sale usage linked to order');
//         }

//         await transaction.commit();
//         console.log('✅ Order completed successfully');

//         // Return success response
//         res.status(201).json({
//             success: true,
//             message: 'Order placed successfully',
//             data: {
//                 order_id: order.id,
//                 order_number: order.order_number,
//                 total_amount: order.total_amount,
//                 flash_discount_applied: flash_discount || 0
//             }
//         });

//     } catch (error) {
//         await transaction.rollback();
//         console.error('❌ Order creation failed:', error);

//         res.status(500).json({
//             success: false,
//             message: 'Failed to create order',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// });

// router.post('/orders', authMiddleware, async (req, res) => {
//   const transaction = await sequelize.transaction();
//   try {
//     const userId = req.user.id;
//     const {
//       shipping_address_id,
//       payment_method,
//       contact_email,
//       contact_phone,
//       order_notes,
//       coupon_code = null,
//       coupon_discount = 0,
//       flash_sale_code = null,
//       flash_discount = 0,
//       flash_usage_id = null
//     } = req.body;

//     // Validate contact & address
//     if (!contact_email || !contact_phone || !shipping_address_id) {
//       await transaction.rollback();
//       return res.status(400).json({ success: false, message: 'Missing contact or address' });
//     }

//     // Fetch cart without ProductMedia
//     const cart = await Cart.findOne({
//       where: { user_id: userId },
//       include: {
//         model: CartItem,
//         include: {
//           model: ProductVariant,
//           include: [{ model: Product }]  // No alias needed
//         }
//       },
//       transaction
//     });
//     if (!cart?.CartItems.length) {
//       await transaction.rollback();
//       return res.status(400).json({ success: false, message: 'Cart is empty' });
//     }

//     // Validate flash sale usage if provided
//     let flashUsage = null;
//     if (flash_usage_id) {
//       flashUsage = await FlashSaleUsage.findByPk(flash_usage_id, { transaction });
//       if (!flashUsage || flashUsage.user_id !== userId) {
//         await transaction.rollback();
//         return res.status(400).json({ success: false, message: 'Invalid flash sale usage' });
//       }
//     }

//     // Calculate subtotal
//     const subtotal = cart.CartItems.reduce((sum, item) => {
//       const price = item.ProductVariant.sale_price || item.ProductVariant.price;
//       return sum + price * item.quantity;
//     }, 0);

//     // Apply discounts
//     const afterCoupon = Math.max(0, subtotal - parseFloat(coupon_discount));
//     const afterFlash = Math.max(0, afterCoupon - parseFloat(flash_discount));
//     const gst_amount = parseFloat((afterFlash * 0.18).toFixed(2));
//     const shipping_charge = afterFlash >= 250 ? 0 : 50;
//     const total_amount = parseFloat((afterFlash + gst_amount + shipping_charge).toFixed(2));

//     // Generate order number
//     const orderCount = (await Order.count({ transaction })) + 1;
//     const order_number = `ORD${Date.now()}${orderCount.toString().padStart(3, '0')}`;

//     // Create order
//     const order = await Order.create({
//       user_id: userId,
//       order_number,
//       shipping_address_id,
//       subtotal_amount: subtotal,
//       gst_amount,
//       shipping_charge,
//       total_amount,
//       payment_method,
//       payment_status: 'pending',
//       order_status: 'pending',
//       contact_email,
//       contact_phone,
//       order_notes: order_notes || null,
//       coupon_code,
//       coupon_discount,
//       flash_sale_code,
//       flash_discount,
//       flash_usage_id
//     }, { transaction });

//     // Create items and update stock
//     for (const item of cart.CartItems) {
//       const variant = item.ProductVariant;
//       const price = variant.sale_price || variant.price;
//      await OrderItem.create({
//   order_id: order.id,
//   product_variant_id: variant.id,
//   // Required snapshot fields:
//   product_name_snapshot: variant.Product.name,
//   price_at_purchase: price,

//   variant_sku: variant.sku,
//   quantity: item.quantity,
//   // You can keep total_price if model supports it:
//   total_price: price * item.quantity
// }, { transaction });


//       if (variant.stock_quantity != null) {
//         await variant.decrement('stock_quantity', { by: item.quantity, transaction });
//       }
//     }

//     // Clear cart
//     await CartItem.destroy({ where: { cart_id: cart.id }, transaction });

//     // Link flash sale usage
//     if (flashUsage) {
//       await flashUsage.update({ used_in_order_id: order.id, used_at: new Date() }, { transaction });
//     }

//     await transaction.commit();
//     return res.status(201).json({
//       success: true,
//       message: 'Order placed successfully',
//       order_id: order.id,
//       order_number,
//       total_amount
//     });
//   } catch (error) {
//     await transaction.rollback();
//     console.error('Order creation error:', error);
//     return res.status(500).json({ success: false, message: 'Failed to place order' });
//   }
// });

router.post('/orders', authMiddleware, async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const {
            shipping_address_id,
            payment_method,
            contact_email,
            contact_phone,
            order_notes,
            coupon_code = null,
            coupon_discount = 0,
            flash_sale_code = null,
            flash_discount = 0,
            flash_usage_id = null
        } = req.body;

        // Validate contact & address
        if (!contact_email || !contact_phone || !shipping_address_id) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Missing contact or address' });
        }

        // Fetch cart
        const cart = await Cart.findOne({
            where: { user_id: userId },
            include: {
                model: CartItem,
                include: {
                    model: ProductVariant,
                    include: [{ model: Product }]
                }
            },
            transaction
        });
        if (!cart?.CartItems.length) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Validate flash usage
        let flashUsage = null;
        if (flash_usage_id) {
            flashUsage = await FlashSaleUsage.findByPk(flash_usage_id, { transaction });
            if (!flashUsage || flashUsage.user_id !== userId) {
                await transaction.rollback();
                return res.status(400).json({ success: false, message: 'Invalid flash sale usage' });
            }
        }

        // Calculate subtotal
        const subtotal = cart.CartItems.reduce((sum, item) => {
            const price = item.ProductVariant.sale_price || item.ProductVariant.price;
            return sum + price * item.quantity;
        }, 0);

        // Apply discounts
        const afterCoupon = Math.max(0, subtotal - parseFloat(coupon_discount));
        const afterFlash = Math.max(0, afterCoupon - parseFloat(flash_discount));
        const gst_amount = parseFloat((afterFlash * 0.18).toFixed(2));
        const shipping_charge = afterFlash >= 250 ? 0 : 50;
        const total_amount = parseFloat((afterFlash + gst_amount + shipping_charge).toFixed(2));

        // Generate order number
        const orderCount = (await Order.count({ transaction })) + 1;
        const order_number = `ORD${Date.now()}${orderCount.toString().padStart(3, '0')}`;

        // Create order
        const order = await Order.create({
            user_id: userId,
            order_number,
            shipping_address_id,
            subtotal_amount: subtotal,
            gst_amount,
            shipping_charge,
            total_amount,
            payment_method,
            payment_status: 'pending',
            order_status: 'pending',
            contact_email,
            contact_phone,
            order_notes: order_notes || null,
            coupon_code,
            coupon_discount,
            flash_sale_code: flash_sale_code || null,
            flash_discount: flash_discount ? parseFloat(flash_discount) : 0,
            flash_usage_id: flash_usage_id || null
        }, { transaction });

        // Create items and update stock
        for (const item of cart.CartItems) {
            const variant = item.ProductVariant;
            const price = variant.sale_price || variant.price;

            await OrderItem.create({
                order_id: order.id,
                product_variant_id: variant.id,
                product_name_snapshot: variant.Product.name,
                price_at_purchase: price,
                variant_sku: variant.sku,
                quantity: item.quantity,
                total_price: price * item.quantity
            }, { transaction });

            if (variant.stock_quantity != null) {
                await variant.decrement('stock_quantity', { by: item.quantity, transaction });
            }
        }

        // Clear cart
        await CartItem.destroy({ where: { cart_id: cart.id }, transaction });

        // Link and update flash sale usage if applicable
        if (flashUsage) {
            const appliedFlag = flash_discount > 0 ? 1 : 0;
            await flashUsage.update({
                used_in_order_id: order.id,
                used_at: new Date(),
                discount_applied: appliedFlag
            }, { transaction });
        }

        await transaction.commit();
        return res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            order_id: order.id,
            order_number,
            total_amount
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Order creation error:', error);
        return res.status(500).json({ success: false, message: 'Failed to place order' });
    }
});







// GET /api/orders
router.get('/orders', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10, status } = req.query;

        const whereClause = { user_id: userId };
        if (status) whereClause.order_status = status;

        const result = await Order.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [
                        {
                            model: ProductVariant,
                            as: 'ProductVariant',
                            include: [
                                {
                                    model: Product,
                                    as: 'Product',
                                    attributes: ['id', 'name']
                                }
                            ]
                        }
                    ]
                },
                {
                    model: Address,
                    as: 'ShippingAddress',  // ✅ Change from 'Address' to 'ShippingAddress'
                    attributes: [
                        'id', 'street_address', 'city',
                        'state', 'postal_code', 'country',
                        'phone_number'
                    ]
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'first_name', 'last_name']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        return res.json({
            success: true,
            orders: result.rows,
            pagination: {
                total: result.count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(result.count / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('❌ GET /orders error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
});

// GET /api/orders/:orderId
// router.get('/orders/:orderId', authMiddleware, async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { orderId } = req.params;

//     const order = await Order.findOne({
//       where: { id: orderId, user_id: userId },
//       include: [
//         {
//           model: OrderItem,
//           as: 'OrderItems',
//           include: [
//             {
//               model: ProductVariant,
//               as: 'ProductVariant',
//               include: [
//                 {
//                   model: Product,
//                   as: 'Product'
//                 }
//               ]
//             }
//           ]
//         },
//         {
//           model: Address,
//           as: 'ShippingAddress',  // ✅ Change from 'Address' to 'ShippingAddress'
//           attributes: [
//             'id', 'street_address', 'city',
//             'state', 'postal_code', 'country',
//             'phone_number'
//           ]
//         },
//         {
//           model: User,
//           as: 'User',
//           attributes: ['id', 'first_name', 'last_name', 'email']
//         }
//       ]
//     });

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: 'Order not found'
//       });
//     }

//     return res.json({
//       success: true,
//       order
//     });
//   } catch (error) {
//     console.error('❌ GET /orders/:orderId error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch order'
//     });
//   }
// });

// router.get('/orders/:orderId', authMiddleware, async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { orderId } = req.params;

//     const order = await Order.findOne({
//       where: { id: orderId, user_id: userId },
//       include: [
//         {
//           model: OrderItem,
//           as: 'OrderItems',
//           include: [
//             {
//               model: ProductVariant,
//               as: 'ProductVariant',
//               include: [
//                 {
//                   model: Product,
//                   as: 'Product'
//                 }
//               ]
//             }
//           ]
//         },
//         {
//           model: Address,
//           as: 'ShippingAddress',
//           attributes: [
//             'id', 'street_address', 'city',
//             'state', 'postal_code', 'country',
//             'phone_number'
//           ]
//         },
//         {
//           model: User,
//           as: 'User',
//           attributes: ['id', 'first_name', 'last_name', 'email']
//         },
//         {
//           model: FlashSaleUsage,
//           as: 'flashSaleUsage', // Use exact alias as defined in the model
//           include: [
//             {
//               model: FlashSaleTier,
//               as: 'tier'
//             },
//             {
//               model: FlashSale,
//               as: 'flashSale'
//             }
//           ]
//         }
//       ]
//     });

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: 'Order not found'
//       });
//     }

//     return res.json({
//       success: true,
//       order
//     });
//   } catch (error) {
//     console.error('❌ GET /orders/:orderId error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch order'
//     });
//   }
// });

router.get('/orders/:orderId', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId } = req.params;

        const order = await Order.findOne({
            where: { id: orderId, user_id: userId },
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [
                        {
                            model: ProductVariant,
                            as: 'ProductVariant',
                            include: [
                                {
                                    model: Product,
                                    as: 'Product'
                                }
                            ]
                        }
                    ]
                },
                {
                    model: Address,
                    as: 'ShippingAddress',
                    attributes: [
                        'id', 'street_address', 'city',
                        'state', 'postal_code', 'country',
                        'phone_number'
                    ]
                },
                {
                    model: User,
                    as: 'User',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: FlashSaleUsage,
                    as: 'flashSaleUsage',
                    required: false, // ✅ ADD THIS - makes the join optional (LEFT JOIN)
                    include: [
                        {
                            model: FlashSaleTier,
                            as: 'tier',
                            required: false
                        },
                        {
                            model: FlashSale,
                            as: 'flashSale',
                            required: false
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        return res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('❌ GET /orders/:orderId error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            error: error.message
        });
    }
});







// ✅ Update Order Status (Admin only - you can add admin middleware)
router.put('/orders/:orderId/status', authMiddleware, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { order_status, payment_status } = req.body;

        const order = await Order.findByPk(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const updateData = {};
        if (order_status) updateData.order_status = order_status;
        if (payment_status) updateData.payment_status = payment_status;

        await order.update(updateData);

        res.json({
            success: true,
            message: 'Order updated successfully',
            order: order
        });

    } catch (error) {
        console.error('❌ Error updating order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order'
        });
    }
});

// ✅ Create Razorpay Order
router.post('/create-razorpay-order', authMiddleware, async (req, res) => {
    try {
        const { amount, currency = 'INR' } = req.body;

        if (!amount) {
            return res.status(400).json({ success: false, message: 'Amount is required' });
        }

        const options = {
            amount: Math.round(amount * 100), // amount in lowest denomination (paise)
            currency,
            receipt: `receipt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        if (!order) {
            return res.status(500).json({ success: false, message: 'Some error occured' });
        }

        res.json({
            success: true,
            order,
            key: "rzp_live_SAWrANbkbWONmt"
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
    }
});

// ✅ Verify Razorpay Payment
router.post('/verify-payment', authMiddleware, async (req, res) => {
    try {
        console.log('🔥 Verify Payment Called');
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, order_id } = req.body;

        console.log('📥 Payment Data Received:', {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            order_id
        });

        const secret = "SbJ3eWEcqonP3rgN3z1jb4NX"; // Using the test key as requested
        // const secret = process.env.RAZORPAY_KEY_SECRET; 

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(body.toString())
            .digest('hex');

        console.log('🔐 Signature Debug:', {
            generated_signature,
            received_signature: razorpay_signature,
            match: generated_signature === razorpay_signature,
            body_used: body,
            secret_used: secret ? '***PRESENT***' : '***MISSING***'
        });

        if (generated_signature !== razorpay_signature) {
            console.log('❌ Signature verification failed');
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed: Invalid signature'
            });
        }

        const order = await Order.findByPk(order_id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Update order with payment info
        await order.update({
            payment_status: 'completed', // Or 'completed'
            payment_gateway_txn_id: razorpay_payment_id,
            razorpay_order_id: razorpay_order_id,
            razorpay_signature: razorpay_signature,
            order_status: 'processing' // Move to processing after successful payment
        });

        res.json({
            success: true,
            message: 'Payment verified successfully',
            orderId: order.id
        });

    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
});

// ✅ Cancel Order
router.post('/:orderId/cancel', authMiddleware, async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const userId = req.user.id;
        const { orderId } = req.params;
        const { reason } = req.body;

        const order = await Order.findOne({
            where: {
                id: orderId,
                user_id: userId
            },
            include: [{
                model: OrderItem,
                as: 'OrderItems'
            }]
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be cancelled
        if (!['pending', 'processing'].includes(order.order_status)) {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be cancelled at this stage'
            });
        }

        // Update order status
        await order.update({
            order_status: 'cancelled',
            cancellation_reason: reason || null
        }, { transaction });

        // Restore stock quantities
        for (const item of order.OrderItems) {
            await ProductVariant.increment('stock_quantity', {
                by: item.quantity,
                where: { id: item.product_variant_id },
                transaction
            });
        }

        await transaction.commit();

        res.json({
            success: true,
            message: 'Order cancelled successfully'
        });

    } catch (error) {
        await transaction.rollback();
        console.error('❌ Error cancelling order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order'
        });
    }
});








router.post('/logout', authMiddleware, (req, res) => {
    // With JWT, the primary logout mechanism is deleting the token on the client-side.
    // This server-side route is here for good practice and can be extended later
    // for features like adding the token to a "blacklist" if needed.

    // For now, it just confirms the action.
    res.status(200).json({ message: 'Logout successful.' });
});


module.exports = router;

