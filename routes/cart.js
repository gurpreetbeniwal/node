const express = require('express');
const router = express.Router();
const { Cart, CartItem, User, Product, ProductVariant, ProductMedia, Category, sequelize } = require('../models/models');
const authMiddleware = require('../middleware/authMiddleware');

const authenticateUser = authMiddleware;

router.get('/', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('🛒 Getting cart for user:', userId);

        // Find or create cart for user
        let cart = await Cart.findOne({
            where: { user_id: userId },
            include: [{
                model: CartItem,
                as: 'CartItems', // ✅ Use correct alias
                include: [{
                    model: ProductVariant,
                    as: 'ProductVariant',
                    include: [
                        {
                            model: Product,
                            as: 'Product',
                            include: [
                                {
                                    model: ProductMedia,
                                    as: 'media',
                                    where: { media_type: 'image' },
                                    required: false,
                                    limit: 2,
                                    order: [['sort_order', 'ASC']]
                                },
                                {
                                    model: Category,
                                    as: 'Category',
                                    attributes: ['id', 'name']
                                }
                            ]
                        }
                    ]
                }]
            }]
        });

        if (!cart) {
            cart = await Cart.create({ user_id: userId });
            cart.CartItems = []; // ✅ Use correct alias
        }

        // ✅ Use correct alias throughout
        const cartItems = cart.CartItems || [];

        // Transform cart items for frontend
        const transformedItems = cartItems.map(item => {
            const variant = item.ProductVariant;
            const product = variant.Product;
            const primaryImage = product.media?.[0];
            const hoverImage = product.media?.[1] || primaryImage;

            return {
                id: item.id,
                productId: product.id,
                variantId: variant.id,
                title: product.name,
                category: product.Category?.name || 'Electronics',
                price: parseFloat(variant.price),
                quantity: item.quantity,
                imgSrc: primaryImage?.url || 'https://via.placeholder.com/500x500',
                imgHover: hoverImage?.url || primaryImage?.url || 'https://via.placeholder.com/500x500',
                variant: {
                    id: variant.id,
                    sku: variant.sku,
                    availableStock: variant.stock_quantity,
                    inStock: variant.stock_quantity >= item.quantity,
                    stockStatus: variant.stock_quantity >= item.quantity ? 'available' : 'insufficient'
                },
                lineTotal: parseFloat(variant.price) * item.quantity
            };
        });

        const totalPrice = transformedItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const totalItems = transformedItems.reduce((sum, item) => sum + item.quantity, 0);

        console.log('✅ Cart retrieved:', transformedItems.length, 'unique items,', totalItems, 'total items');

        res.json({
            success: true,
            cart: {
                id: cart.id,
                items: transformedItems,
                totalItems: totalItems,
                totalPrice: totalPrice,
                hasOutOfStockItems: transformedItems.some(item => !item.variant.inStock),
                canCheckout: transformedItems.length > 0 && transformedItems.every(item => item.variant.inStock)
            }
        });

    } catch (error) {
        console.error('❌ Error getting cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get cart'
        });
    }
});

// ✅ Add item to cart
router.post('/add', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { product_variant_id, quantity = 1 } = req.body;

        console.log('➕ Adding to cart:', { userId, product_variant_id, quantity });

        // Validate product variant exists and get stock info
        const variant = await ProductVariant.findByPk(product_variant_id, {
            include: [{
                model: Product,
                as: 'Product',
                attributes: ['id', 'name', 'is_published']
            }]
        });

        if (!variant) {
            return res.status(404).json({
                success: false,
                message: 'Product variant not found'
            });
        }

        if (!variant.Product.is_published) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }

        // Find or create cart
        let cart = await Cart.findOne({ where: { user_id: userId } });
        if (!cart) {
            cart = await Cart.create({ user_id: userId });
        }

        // Check if item already exists in cart
        const existingItem = await CartItem.findOne({
            where: {
                cart_id: cart.id,
                product_variant_id: product_variant_id
            }
        });

        const requestedQuantity = parseInt(quantity);
        let finalQuantity = requestedQuantity;

        if (existingItem) {
            finalQuantity = existingItem.quantity + requestedQuantity;
        }

        // Check if we have enough stock
        if (finalQuantity > variant.stock_quantity) {
            return res.status(400).json({
                success: false,
                message: `Only ${variant.stock_quantity} items available in stock`,
                availableStock: variant.stock_quantity,
                requestedQuantity: finalQuantity
            });
        }

        if (existingItem) {
            existingItem.quantity = finalQuantity;
            await existingItem.save();
            console.log('📦 Updated existing cart item quantity:', finalQuantity);
        } else {
            await CartItem.create({
                cart_id: cart.id,
                product_variant_id: product_variant_id,
                quantity: finalQuantity
            });
            console.log('🆕 Created new cart item');
        }

        // Get updated cart count
        const cartItems = await CartItem.findAll({ where: { cart_id: cart.id } });
        const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

        res.json({
            success: true,
            message: 'Item added to cart successfully',
            cartCount: totalItems,
            data: {
                variantId: variant.id,
                productName: variant.Product.name,
                quantity: finalQuantity,
                availableStock: variant.stock_quantity
            }
        });

    } catch (error) {
        console.error('❌ Error adding to cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add item to cart'
        });
    }
});

// ✅ Update cart item quantity
router.put('/update/:itemId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { itemId } = req.params;
        const { quantity } = req.body;

        console.log('📝 Updating cart item:', { itemId, quantity });

        // Find cart item belonging to user
        const cartItem = await CartItem.findOne({
            where: { id: itemId },
            include: [
                {
                    model: Cart,
                    as: 'Cart',
                    where: { user_id: userId }
                },
                {
                    model: ProductVariant,
                    as: 'ProductVariant',
                    attributes: ['id', 'stock_quantity', 'price']
                }
            ]
        });

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Cart item not found'
            });
        }

        const newQuantity = parseInt(quantity);

        if (newQuantity <= 0) {
            await cartItem.destroy();
            console.log('🗑️ Removed cart item');
        } else {
            if (newQuantity > cartItem.ProductVariant.stock_quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Only ${cartItem.ProductVariant.stock_quantity} items available in stock`,
                    availableStock: cartItem.ProductVariant.stock_quantity
                });
            }

            cartItem.quantity = newQuantity;
            await cartItem.save();
            console.log('✅ Updated cart item quantity to:', newQuantity);
        }

        res.json({
            success: true,
            message: 'Cart item updated successfully'
        });

    } catch (error) {
        console.error('❌ Error updating cart item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update cart item'
        });
    }
});

// ✅ Remove item from cart
router.delete('/remove/:itemId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { itemId } = req.params;

        console.log('🗑️ Removing cart item:', itemId);

        const cartItem = await CartItem.findOne({
            where: { id: itemId },
            include: [{
                model: Cart,
                as: 'Cart',
                where: { user_id: userId }
            }]
        });

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Cart item not found'
            });
        }

        await cartItem.destroy();
        console.log('✅ Cart item removed');

        res.json({
            success: true,
            message: 'Item removed from cart successfully'
        });

    } catch (error) {
        console.error('❌ Error removing cart item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove item from cart'
        });
    }
});

// ✅ Clear entire cart
router.delete('/clear', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('🧹 Clearing cart for user:', userId);

        const cart = await Cart.findOne({ where: { user_id: userId } });
        if (cart) {
            await CartItem.destroy({ where: { cart_id: cart.id } });
        }

        res.json({
            success: true,
            message: 'Cart cleared successfully'
        });

    } catch (error) {
        console.error('❌ Error clearing cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear cart'
        });
    }
});




module.exports = router;
