const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth')
const path = require('path');
const { Op } = require('sequelize');
const { coupon, Product, Category, Attribute, AttributeValue,
    ProductVariant, ProductMedia, ProductVariantAttribute,
    Order, OrderItem, User, Address, Setting, sequelize,
    SubscriptionPlan, Subscription, FlashSale, FlashSaleTier, FlashSaleUsage, coupons, Influencer,
    MegaOfferFestival, MegaOfferTier, MegaOfferTierEntry, MegaOfferParticipant } = require('../models/models');

const adminUsers = [
    {
        username: process.env.ADMIN_1_USERNAME,
        password: process.env.ADMIN_1_PASSWORD,
        name: process.env.ADMIN_1_NAME
    },
    {
        username: process.env.ADMIN_2_USERNAME,
        password: process.env.ADMIN_2_PASSWORD,
        name: process.env.ADMIN_2_NAME
    }
];




// Helper function to create a URL-friendly "slug" from a string
function createSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s-]/g, '') // remove invalid chars
        .replace(/\s+/g, '-') // collapse whitespace and replace by -
        .replace(/-+/g, '-'); // collapse dashes
}

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/uploads/'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// GET /admin/login - Show login form
router.get('/login', (req, res) => {
    if (req.session && req.session.admin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', {
        title: 'Admin Login',
        error: req.query.error,
        success: req.query.success
    });
});

// POST /admin/login - Process login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect('/admin/login?error=Please enter both username and password');
    }

    // Find admin user
    const admin = adminUsers.find(user =>
        user.username === username && user.password === password
    );

    if (admin) {
        // Set session
        req.session.admin = {
            username: admin.username,
            name: admin.name,
            loginTime: new Date()
        };

        console.log(`Admin login successful: ${admin.name} (${admin.username})`);
        res.redirect('/admin/dashboard');
    } else {
        console.log(`Failed admin login attempt: ${username}`);
        res.redirect('/admin/login?error=Invalid username or password');
    }
});

// GET /admin/logout - Logout
router.get('/logout', (req, res) => {
    if (req.session.admin) {
        console.log(`Admin logout: ${req.session.admin.name}`);
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/admin/login?success=Logged out successfully');
        });
    } else {
        res.redirect('/admin/login');
    }
});


// =================================================================
// DASHBOARD
// =================================================================
router.get('/dashboard', adminAuth, async (req, res) => {
    try {
        const totalOrders = await Order.count();
        const totalRevenueResult = await Order.findOne({
            attributes: [[sequelize.fn('SUM', sequelize.col('total_amount')), 'totalRevenue']],
            where: { payment_status: 'completed' }
        });
        const newCustomers = await User.count({ where: { role: 'customer', created_at: { [Op.gte]: new Date(new Date() - 30 * 24 * 60 * 60 * 1000) } } });

        const stats = {
            totalOrders,
            totalRevenue: totalRevenueResult.get('totalRevenue') || 0,
            newCustomers
        };
        res.render('dashboard', { title: 'Admin Dashboard', stats });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching dashboard stats.");
    }
});


// =================================================================
// PRODUCT ROUTES
// =================================================================
router.get('/products', adminAuth, async (req, res) => {
    try {
        const products = await Product.findAll({
            include: [{ model: Category, attributes: ['name'] }],
            order: [['created_at', 'DESC']]
        });
        console.log(products)
        res.render('products', { title: 'Manage Products', products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send("Error fetching products.");
    }
});

router.get('/products/add', adminAuth, async (req, res) => {
    try {
        const categories = await Category.findAll({ order: [['name', 'ASC']] });
        res.render('add-product', { title: 'Add New Product', categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).send("Error fetching categories for product form.");
    }
});

router.post('/products/add', adminAuth, upload.array('product_media', 10), async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { name, description, brand, category_id, variations } = req.body;
        const product = await Product.create({
            name,
            slug: createSlug(name),
            description,
            brand,
            category_id
        }, { transaction: t });

        if (req.files && req.files.length > 0) {
            await Promise.all(req.files.map(file => ProductMedia.create({
                product_id: product.id,
                url: `/uploads/${file.filename}`,
                media_type: file.mimetype.startsWith('image') ? 'image' : 'video',
                alt_text: name
            }, { transaction: t })));
        }

        if (variations && variations.length > 0) {
            for (const v of variations) {
                const newVariant = await ProductVariant.create({
                    product_id: product.id,
                    sku: v.sku,
                    price: v.price,
                    stock_quantity: v.stock_quantity
                }, { transaction: t });

                if (v.attributes && v.attributes.length > 0) {
                    for (const attr of v.attributes) {
                        const [attribute] = await Attribute.findOrCreate({ where: { name: attr.name.trim() }, transaction: t });
                        const [attributeValue] = await AttributeValue.findOrCreate({ where: { attribute_id: attribute.id, value: attr.value.trim() }, transaction: t });
                        await newVariant.addAttributeValue(attributeValue, { transaction: t });
                    }
                }
            }
        }
        await t.commit();
        res.redirect('/admin/products');
    } catch (error) {
        await t.rollback();
        console.error('Failed to create product:', error);
        res.status(500).send("Error creating product.");
    }
});


// =================================================================
// CATEGORY ROUTES
// =================================================================

router.get('/categories', adminAuth, async (req, res) => {
    try {
        const categories = await Category.findAll({
            include: { model: Category, as: 'parent', attributes: ['name'] },
            order: [['name', 'ASC']]
        });
        res.render('categories', { title: 'Manage Categories', categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).send('Error fetching categories');
    }
});

router.post('/categories/add', adminAuth, async (req, res) => {
    try {
        const { name, description, parent_id } = req.body;
        await Category.create({
            name,
            description,
            slug: createSlug(name),
            parent_id: parent_id || null
        });
        res.redirect('/admin/categories');
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).send('Error creating category');
    }
});

// POST /categories/edit/:id - Update category
router.post('/categories/edit/:id', adminAuth, async (req, res) => {
    try {
        const { name, description, parent_id } = req.body;
        const category = await Category.findByPk(req.params.id);
        if (category) {
            await category.update({
                name,
                description,
                slug: createSlug(name),
                parent_id: parent_id || null
            });
        }
        res.redirect('/admin/categories');
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).send('Error updating category');
    }
});

// POST /categories/delete/:id - Delete category
router.post('/categories/delete/:id', adminAuth, async (req, res) => {
    try {
        await Category.destroy({ where: { id: req.params.id } });
        res.redirect('/admin/categories');
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).send('Error deleting category');
    }
});

// =================================================================
// ORDER ROUTES
// =================================================================
router.get('/orders', adminAuth, async (req, res) => {
    try {
        const { status, payment_status } = req.query;
        const where = {};

        if (status) where.order_status = status;
        if (payment_status) where.payment_status = payment_status;

        const orders = await Order.findAll({
            where,
            include: [{ model: User, attributes: ['first_name', 'last_name', 'email'] }],
            order: [['created_at', 'DESC']]
        });

        res.render('orders', {
            title: 'Manage Orders',
            orders,
            filters: {
                status: status || '',
                payment_status: payment_status || ''
            }
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Error fetching orders');
    }
});

router.get('/orders/:id', adminAuth, async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.id, {
            include: [
                { model: User, attributes: ['first_name', 'last_name', 'email'] },
                { model: Address },
                {
                    model: OrderItem,
                    include: [{ model: ProductVariant, attributes: ['sku'] }]
                }
            ]
        });
        if (!order) {
            return res.status(404).send('Order not found');
        }
        res.render('order-detail', { title: `Order #${order.id}`, order });
    } catch (error) {
        console.error(`Error fetching order ${req.params.id}:`, error);
        res.status(500).send('Error fetching order details');
    }
});

router.get('/orders-data/:id', adminAuth, async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.id, {
            include: [
                { model: User, attributes: ['first_name', 'last_name', 'email', 'phone_number'] },
                { model: Address, as: 'ShippingAddress' },
                {
                    model: OrderItem,
                    include: [
                        {
                            model: ProductVariant,
                            attributes: ['sku'],
                            include: [
                                {
                                    model: AttributeValue,
                                    through: { attributes: [] },
                                    include: [{ model: Attribute, attributes: ['name'] }]
                                },
                                { model: Product, attributes: ['name'] }
                            ]
                        }
                    ]
                }
            ]
        });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        res.json({ success: true, order });
    } catch (error) {
        console.error(`Error fetching order data ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Error fetching order details' });
    }
});

router.post('/orders/update-status/:id', adminAuth, async (req, res) => {
    try {
        const { order_status, payment_status } = req.body;
        const order = await Order.findByPk(req.params.id);
        if (order) {
            if (order_status) order.order_status = order_status;
            if (payment_status) order.payment_status = payment_status;
            await order.save();
            res.json({ success: true, message: 'Order status updated successfully' });
        } else {
            res.status(404).json({ success: false, message: 'Order not found' });
        }
    } catch (error) {
        console.error(`Error updating order status for ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Error updating order status' });
    }
});


// =================================================================
// ATTRIBUTE ROUTES
// =================================================================
router.get('/attributes', adminAuth, async (req, res) => {
    try {
        const attributes = await Attribute.findAll({
            include: [{ model: AttributeValue }],
            order: [['name', 'ASC']]
        });
        res.render('attributes', { title: 'Manage Attributes', attributes });
    } catch (error) {
        console.error('Error fetching attributes:', error);
        res.status(500).send('Error fetching attributes');
    }
});

router.post('/attributes/add', adminAuth, async (req, res) => {
    try {
        const { name } = req.body;
        await Attribute.findOrCreate({
            where: { name: name.trim() }
        });
        res.redirect('/admin/attributes');
    } catch (error) {
        console.error('Error creating attribute:', error);
        res.status(500).send('Error creating attribute');
    }
});

router.post('/attributes/add-value', adminAuth, async (req, res) => {
    try {
        const { attribute_id, value } = req.body;
        await AttributeValue.findOrCreate({
            where: {
                attribute_id: attribute_id,
                value: value.trim()
            }
        });
        res.redirect('/admin/attributes');
    } catch (error) {
        console.error('Error creating attribute value:', error);
        res.status(500).send('Error creating attribute value');
    }
});



router.get('/products/update/:id', adminAuth, async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id, {
            include: [
                { model: ProductMedia, as: 'media' },
                {
                    model: ProductVariant,
                    as: 'variants',
                    include: [{
                        model: AttributeValue,
                        as: 'AttributeValues', // This should match the alias in your association
                        through: { attributes: [] }, // Hide junction table data
                        include: [{
                            model: Attribute,
                            attributes: ['id', 'name']
                        }]
                    }]
                }
            ]
        });

        if (!product) {
            return res.status(404).send("Product not found");
        }

        const categories = await Category.findAll({ order: [['name', 'ASC']] });
        const attributes = await Attribute.findAll({
            include: [{ model: AttributeValue, as: 'AttributeValues' }],
            order: [['name', 'ASC']]
        });

        res.render('update-product', {
            title: `Edit Product: ${product.name}`,
            product: product,
            categories: categories,
            attributes: attributes
        });

    } catch (error) {
        console.error('Error fetching product for update:', error);
        res.status(500).send("Error loading the update product page.");
    }
});



/**
 * @route   POST /admin/products/update/:id
 * @desc    Process the submitted product update form.
 * @access  Private
 */
router.post('/products/update/:id', adminAuth, upload.array('product_media', 10), async (req, res) => {
    const { id } = req.params;

    // Start a database transaction.
    const t = await sequelize.transaction();

    try {
        const {
            name,
            brand,
            category_id,
            description,
            is_published,
            delete_media,
            variations
        } = req.body;

        // Step 1: Find the product and update its core details
        const product = await Product.findByPk(id, { transaction: t });
        if (!product) {
            await t.rollback();
            return res.status(404).send('Product not found');
        }
        await product.update({
            name,
            brand,
            category_id,
            description,
            is_published: is_published === 'true',
            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        }, { transaction: t });


        // Step 2: Handle Media Deletion
        if (delete_media && delete_media.length > 0) {
            // You should also add logic here to delete the actual files from your 'public/uploads' folder
            await ProductMedia.destroy({
                where: { id: delete_media, product_id: id },
                transaction: t
            });
        }

        // Step 3: Handle New Media Uploads
        if (req.files && req.files.length > 0) {
            // --- FIX STARTS HERE ---
            // We now create an object that perfectly matches your ProductMedia model.
            const newMedia = req.files.map((file, index) => ({
                product_id: product.id,
                url: `/uploads/${file.filename}`,
                media_type: file.mimetype.startsWith('image') ? 'image' : 'video',
                alt_text: product.name, // Provide the product name as a good default alt text.
                sort_order: index // Provide a default sort order.
            }));
            // --- FIX ENDS HERE ---
            await ProductMedia.bulkCreate(newMedia, { transaction: t });
        }


        // Step 4: Wipe and recreate variations
        await ProductVariant.destroy({ where: { product_id: id }, transaction: t });
        if (variations && variations.length > 0) {
            for (const v of variations) {
                const newVariant = await ProductVariant.create({
                    product_id: product.id,
                    sku: v.sku,
                    price: v.price,
                    stock_quantity: v.stock_quantity
                }, { transaction: t });
                if (v.attributes && v.attributes.length > 0) {
                    for (const attr of v.attributes) {
                        const [attribute] = await Attribute.findOrCreate({ where: { name: attr.name.trim() }, transaction: t });
                        const [attributeValue] = await AttributeValue.findOrCreate({ where: { attribute_id: attribute.id, value: attr.value.trim() }, transaction: t });
                        await ProductVariantAttribute.create({
                            variant_id: newVariant.id,
                            attribute_value_id: attributeValue.id
                        }, { transaction: t });
                    }
                }
            }
        }

        // If everything worked, commit the transaction.
        await t.commit();
        res.redirect('/admin/products');

    } catch (error) {
        // If anything failed, undo all changes.
        await t.rollback();
        console.error('Error updating product:', error);
        res.status(500).send('Failed to update product.');
    }
});


// =================================================================
// --- ORDER MANAGEMENT ---
// =================================================================

router.get('/orders', adminAuth, async (req, res) => {
    try {
        const orders = await Order.findAll({
            include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email'] }],
            order: [['created_at', 'DESC']]
        });
        res.render('orders', { title: 'Manage Orders', orders });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Error loading orders page.');
    }
});

router.get('/orders/:id', adminAuth, async (req, res) => {
    try {
        const order = await Order.findByPk(req.params.id, {
            include: [
                { model: User, as: 'user' },
                { model: Address, as: 'shipping_address' },
                { model: OrderItem, as: 'order_items' }
            ]
        });
        if (!order) return res.status(404).send('Order not found.');
        res.render('order-detail', { title: `Order #${order.id}`, order });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).send('Error loading order detail page.');
    }
});


// =================================================================
// --- SETTINGS MANAGEMENT ---
// =================================================================

router.get('/settings', adminAuth, async (req, res) => {
    try {
        const settings = await Setting.findAll({ order: [['id', 'ASC']] });

        res.render('settings', { title: 'Manage Site Settings', settings });
    } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).send("Could not load settings page.");
    }
});

router.post('/settings', adminAuth, async (req, res) => {
    try {
        const updates = [];
        for (const key in req.body) {
            updates.push(Setting.update({ setting_value: req.body[key] }, { where: { setting_key: key } }));
        }
        await Promise.all(updates);
        res.redirect('/admin/settings');
    } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).send("Failed to update settings.");
    }
});




// GET /admin/coupons  — list all
// router.get('/coupons',  async (req, res) => {
//   try {
//     const coupons = await Coupon.findAll({ order: [['created_at','DESC']] });
//     res.render('coupons/index', { coupons });
//   } catch (err) {
//     console.error('Error fetching coupons:', err);
//     req.flash('error','Unable to load coupons');
//     res.redirect('/admin');
//   }
// });

// // GET /admin/coupons/new  — show form
// router.get('/coupons/new', (req, res) => {
//   res.render('coupons/form', { coupon: {}, errors: {} });
// });

// // POST /admin/coupons  — create
// router.post('/coupons',  async (req, res) => {
//   const { code,type,value,minimum_order_amount,maximum_discount_amount,usage_limit,valid_from,valid_until,is_active } = req.body;
//   try {
//     await Coupon.create({
//       code,type,value,
//       minimum_order_amount: minimum_order_amount||null,
//       maximum_discount_amount: maximum_discount_amount||null,
//       usage_limit: usage_limit||null,
//       valid_from, valid_until,
//       is_active: is_active==='on'
//     });
//     req.flash('success','Coupon created');
//     res.redirect('/admin/coupons');
//   } catch (err) {
//     console.error('Error creating coupon:', err);
//     const errors = (err.errors||[]).reduce((acc,e)=>{ acc[e.path]=e.message; return acc },{});
//     res.render('coupons/form',{ coupon: req.body, errors });
//   }
// });

// // POST /admin/coupons/:id/delete  — delete
// router.post('/coupons/:id/delete',  async (req, res) => {
//   try {
//     await Coupon.destroy({ where: { id: req.params.id } });
//     req.flash('success','Coupon deleted');
//   } catch (err) {
//     console.error('Error deleting coupon:', err);
//     req.flash('error','Unable to delete coupon');
//   }
//   res.redirect('/admin/coupons');
// });



// =================================================================
// STOCK MANAGEMENT
// =================================================================

// GET /admin/stock - Stock management page
router.get('/stock', adminAuth, async (req, res) => {
    try {
        const { product_id, category_id, stock_status } = req.query;

        let productWhereClause = {};
        let variantWhereClause = {};

        if (product_id) productWhereClause.id = product_id;
        if (category_id) productWhereClause.category_id = category_id;

        // ✅ Add stock status filter
        if (stock_status) {
            switch (stock_status) {
                case 'out_of_stock':
                    variantWhereClause.stock_quantity = 0;
                    break;
                case 'low_stock':
                    variantWhereClause.stock_quantity = {
                        [Op.gt]: 0,
                        [Op.lte]: 10
                    };
                    break;
                case 'in_stock':
                    variantWhereClause.stock_quantity = {
                        [Op.gt]: 10
                    };
                    break;
            }
        }

        const products = await Product.findAll({
            where: productWhereClause,
            include: [
                {
                    model: Category,
                    attributes: ['id', 'name']
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    where: Object.keys(variantWhereClause).length > 0 ? variantWhereClause : undefined,
                    include: [{
                        model: AttributeValue,
                        as: 'AttributeValues',
                        through: { attributes: [] },
                        include: [{
                            model: Attribute,
                            attributes: ['id', 'name']
                        }]
                    }]
                }
            ],
            order: [['name', 'ASC']]
        });

        const categories = await Category.findAll({
            order: [['name', 'ASC']]
        });

        const allProducts = await Product.findAll({
            attributes: ['id', 'name'],
            order: [['name', 'ASC']]
        });

        res.render('stock-management', {
            title: 'Stock Management',
            products,
            categories,
            allProducts,
            currentFilters: { product_id, category_id, stock_status }
        });
    } catch (error) {
        console.error('Error fetching stock data:', error);
        res.status(500).send('Error loading stock management page');
    }
});

// POST /admin/stock/update - Bulk stock update
router.post('/stock/update', adminAuth, async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { stock_updates } = req.body;

        if (stock_updates && Array.isArray(stock_updates)) {
            for (const update of stock_updates) {
                const { variant_id, stock_quantity } = update;
                if (variant_id && stock_quantity !== undefined) {
                    await ProductVariant.update(
                        { stock_quantity: parseInt(stock_quantity) },
                        {
                            where: { id: variant_id },
                            transaction: t
                        }
                    );
                }
            }
        }

        await t.commit();
        res.json({ success: true, message: 'Stock updated successfully' });
    } catch (error) {
        await t.rollback();
        console.error('Error updating stock:', error);
        res.status(500).json({ success: false, message: 'Error updating stock' });
    }
});

// POST /admin/stock/update-single - Single variant stock update
router.post('/stock/update-single', adminAuth, async (req, res) => {
    try {
        const { variant_id, stock_quantity } = req.body;

        await ProductVariant.update(
            { stock_quantity: parseInt(stock_quantity) },
            { where: { id: variant_id } }
        );

        res.json({ success: true, message: 'Stock updated successfully' });
    } catch (error) {
        console.error('Error updating single stock:', error);
        res.status(500).json({ success: false, message: 'Error updating stock' });
    }
});





// Subscription Plans Management - GET page
router.get('/subscription-plans', adminAuth, async (req, res) => {
    try {
        const plans = await SubscriptionPlan.findAll({
            include: [{
                model: Subscription,
                as: 'subscriptions',
                attributes: ['id', 'status']
            }],
            order: [['created_at', 'DESC']]
        });

        res.render('subscription-plans', {
            title: 'Subscription Plans Management',
            plans
        });
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).render('error', { message: 'Error fetching plans' });
    }
});

// Create Subscription Plan - POST (form submission)
router.post('/subscription-plans/create', adminAuth, async (req, res) => {
    try {
        const { name, duration_days, price, is_active } = req.body;

        if (!name || !duration_days || !price) {
            return res.redirect('/admin/subscription-plans?error=Missing required fields');
        }

        await SubscriptionPlan.create({
            name,
            duration_days: parseInt(duration_days),
            price: parseFloat(price),
            is_active: is_active === 'on' ? true : false
        });

        res.redirect('/admin/subscription-plans?success=Plan created successfully');
    } catch (error) {
        console.error('Error creating subscription plan:', error);
        res.redirect('/admin/subscription-plans?error=Failed to create plan');
    }
});

// Edit Subscription Plan - GET (show edit form)


router.get('/subscription-plans/:id/edit', adminAuth, async (req, res) => {
    try {
        const plans = await SubscriptionPlan.findAll({
            include: [{
                model: Subscription,
                as: 'subscriptions',
                attributes: ['id', 'status']
            }],
            order: [['created_at', 'DESC']]
        });

        const plan = await SubscriptionPlan.findByPk(req.params.id);

        if (!plan) {
            return res.redirect('/admin/subscription-plans?error=Plan not found');
        }

        res.render('subscription-plans', {
            title: 'Subscription Plans Management',
            plans,
            editPlan: plan // Pass the plan to edit
        });
    } catch (error) {
        console.error('Error fetching plan for edit:', error);
        res.redirect('/admin/subscription-plans?error=Error loading plan for edit');
    }
});

// =================================================================
// --- INFLUENCER MANAGEMENT ---
// =================================================================

// GET /admin/influencers - List all influencers
router.get('/influencers', adminAuth, async (req, res) => {
    try {
        const influencers = await Influencer.findAll({
            order: [['created_at', 'DESC']]
        });
        res.render('influencers', {
            title: 'Influencer Management',
            influencers
        });
    } catch (error) {
        console.error('Error fetching influencers:', error);
        res.status(500).send('Error loading influencers page');
    }
});

// POST /admin/influencers/create - Create new influencer
router.post('/influencers/create', adminAuth, async (req, res) => {
    try {
        const { name, referral_code, discount_percent, is_active } = req.body;

        // Check for duplicate code
        const existing = await Influencer.findOne({ where: { referral_code } });
        if (existing) {
            return res.redirect('/admin/influencers?error=Referral code already exists');
        }

        await Influencer.create({
            name,
            referral_code,
            discount_percent: parseFloat(discount_percent),
            is_active: is_active === 'on'
        });

        res.redirect('/admin/influencers?success=Influencer created successfully');
    } catch (error) {
        console.error('Error creating influencer:', error);
        res.redirect('/admin/influencers?error=Failed to create influencer');
    }
});

// POST /admin/influencers/:id/update - Update influencer
router.post('/influencers/:id/update', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, referral_code, discount_percent, is_active } = req.body;

        const influencer = await Influencer.findByPk(id);
        if (!influencer) {
            return res.redirect('/admin/influencers?error=Influencer not found');
        }

        // Check for duplicate code if changed
        if (referral_code !== influencer.referral_code) {
            const existing = await Influencer.findOne({ where: { referral_code } });
            if (existing) {
                return res.redirect('/admin/influencers?error=Referral code already taken');
            }
        }

        await influencer.update({
            name,
            referral_code,
            discount_percent: parseFloat(discount_percent),
            is_active: is_active === 'on'
        });

        res.redirect('/admin/influencers?success=Influencer updated successfully');
    } catch (error) {
        console.error('Error updating influencer:', error);
        res.redirect('/admin/influencers?error=Failed to update influencer');
    }
});

// POST /admin/influencers/:id/toggle - Toggle active status
router.post('/influencers/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const influencer = await Influencer.findByPk(id);
        if (influencer) {
            await influencer.update({ is_active: !influencer.is_active });
        }
        res.redirect('/admin/influencers?success=Status updated');
    } catch (error) {
        console.error('Error toggling influencer status:', error);
        res.redirect('/admin/influencers?error=Failed to update status');
    }
});

// POST /admin/influencers/:id/delete - Delete influencer
router.post('/influencers/:id/delete', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await Influencer.destroy({ where: { id } });
        res.redirect('/admin/influencers?success=Influencer deleted');
    } catch (error) {
        console.error('Error deleting influencer:', error);
        res.redirect('/admin/influencers?error=Failed to delete influencer');
    }
});




// Update Subscription Plan - POST
router.post('/subscription-plans/:id/update', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, duration_days, price, is_active } = req.body;

        if (!name || !duration_days || !price) {
            return res.redirect(`/admin/subscription-plans?error=Missing required fields`);
        }

        const plan = await SubscriptionPlan.findByPk(id);
        if (!plan) {
            return res.redirect('/admin/subscription-plans?error=Plan not found');
        }

        await plan.update({
            name,
            duration_days: parseInt(duration_days),
            price: parseFloat(price),
            is_active: is_active === 'on' ? true : false
        });

        res.redirect('/admin/subscription-plans?success=Plan updated successfully');
    } catch (error) {
        console.error('Error updating subscription plan:', error);
        res.redirect('/admin/subscription-plans?error=Failed to update plan');
    }
});

// Toggle Subscription Plan Status - POST
router.post('/subscription-plans/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await SubscriptionPlan.findByPk(id);

        if (!plan) {
            return res.redirect('/admin/subscription-plans?error=Plan not found');
        }

        await plan.update({
            is_active: !plan.is_active
        });

        const status = plan.is_active ? 'deactivated' : 'activated';
        res.redirect(`/admin/subscription-plans?success=Plan ${status} successfully`);
    } catch (error) {
        console.error('Error toggling plan status:', error);
        res.redirect('/admin/subscription-plans?error=Failed to update plan status');
    }
});

// Delete Subscription Plan - POST
router.post('/subscription-plans/:id/delete', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if plan has active subscriptions
        const activeSubscriptions = await Subscription.count({
            where: {
                plan_id: id,
                status: 'active'
            }
        });

        if (activeSubscriptions > 0) {
            return res.redirect('/admin/subscription-plans?error=Cannot delete plan with active subscriptions. Deactivate it instead.');
        }

        const plan = await SubscriptionPlan.findByPk(id);
        if (!plan) {
            return res.redirect('/admin/subscription-plans?error=Plan not found');
        }

        await plan.destroy();
        res.redirect('/admin/subscription-plans?success=Plan deleted successfully');
    } catch (error) {
        console.error('Error deleting subscription plan:', error);
        res.redirect('/admin/subscription-plans?error=Failed to delete plan');
    }
});


// =================================================================
// USER SUBSCRIPTIONS MANAGEMENT
// =================================================================

// GET /admin/user-subscriptions - List all user subscriptions
router.get('/user-subscriptions', adminAuth, async (req, res) => {
    try {
        const { status, search } = req.query;

        let whereClause = {};
        if (status && status !== 'All') {
            whereClause.status = status;
        }

        let userWhereClause = {};
        if (search) {
            userWhereClause = {
                [Op.or]: [
                    { first_name: { [Op.like]: `%${search}%` } },
                    { last_name: { [Op.like]: `%${search}%` } },
                    { email: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        const subscriptions = await Subscription.findAll({
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'user',
                    where: userWhereClause,
                    required: !!search // Only require user if searching
                },
                {
                    model: SubscriptionPlan,
                    as: 'plan'
                }
            ],
            order: [['created_at', 'DESC']]
        });

        const plans = await SubscriptionPlan.findAll({ where: { is_active: true } });

        res.render('user-subscriptions', {
            title: 'User Subscriptions',
            subscriptions,
            plans,
            filters: { status: status || 'All', search: search || '' }
        });
    } catch (error) {
        console.error('Error fetching user subscriptions:', error);
        res.status(500).send('Error loading subscriptions page');
    }
});

// POST /admin/user-subscriptions/update - Update subscription status/dates
router.post('/user-subscriptions/update', adminAuth, async (req, res) => {
    try {
        const { subscription_id, status, end_date } = req.body;

        const subscription = await Subscription.findByPk(subscription_id);
        if (!subscription) {
            return res.json({ success: false, message: 'Subscription not found' });
        }

        await subscription.update({
            status,
            end_date: end_date ? new Date(end_date) : subscription.end_date
        });

        res.json({ success: true, message: 'Subscription updated successfully' });
    } catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
});



// Flash Sales Management - GET page
router.get('/flash-sales', adminAuth, async (req, res) => {
    try {
        // First, let's check if FlashSaleUsage is included in your models
        console.log('Available models:', Object.keys(require('../models/models')));

        const flashSales = await FlashSale.findAll({
            include: [
                {
                    model: FlashSaleTier,
                    as: 'tiers',
                    required: false, // LEFT JOIN instead of INNER JOIN
                    order: [['tier_order', 'ASC']]
                }
                // Temporarily remove FlashSaleUsage to test
                // {
                //     model: FlashSaleUsage,
                //     as: 'usages',
                //     required: false,
                //     include: [{
                //         model: User,
                //         as: 'user',
                //         attributes: ['id', 'first_name', 'last_name', 'email']
                //     }]
                // }
            ],
            order: [['created_at', 'DESC']]
        });

        console.log('Found flash sales:', flashSales.length);

        // Calculate statistics
        const statistics = flashSales.map(sale => {
            const totalSlots = sale.tiers ? sale.tiers.reduce((sum, tier) => sum + tier.member_limit, 0) : 0;
            const usedSlots = sale.tiers ? sale.tiers.reduce((sum, tier) => sum + tier.used_count, 0) : 0;
            const totalUsage = 0; // Will update when FlashSaleUsage is working

            return {
                ...sale.toJSON(),
                statistics: {
                    total_slots: totalSlots,
                    used_slots: usedSlots,
                    remaining_slots: totalSlots - usedSlots,
                    total_usage: totalUsage,
                    utilization_percentage: totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0
                }
            };
        });

        res.render('flash-sales', {
            title: 'Flash Sales Management',
            flashSales: statistics,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Detailed error fetching flash sales:', error);
        res.status(500).send('Error fetching flash sales: ' + error.message);
    }
});


// Create Flash Sale - POST (form submission)
router.post('/flash-sales/create', adminAuth, async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { name, code, description, start_time, end_time } = req.body;

        // Parse tiers from form data
        const tierNames = Array.isArray(req.body.tier_names) ? req.body.tier_names : [req.body.tier_names];
        const memberLimits = Array.isArray(req.body.member_limits) ? req.body.member_limits : [req.body.member_limits];
        const discountPercents = Array.isArray(req.body.discount_percents) ? req.body.discount_percents : [req.body.discount_percents];

        const tiers = tierNames.map((tierName, index) => ({
            tier_name: tierName,
            member_limit: parseInt(memberLimits[index]),
            discount_percent: parseInt(discountPercents[index])
        })).filter(tier => tier.tier_name && tier.member_limit && tier.discount_percent);

        if (!name || !code || !start_time || !end_time || tiers.length === 0) {
            await transaction.rollback();
            return res.redirect('/admin/flash-sales?error=Missing required fields');
        }

        // Check if code already exists
        const existingFlashSale = await FlashSale.findOne({
            where: { code: code.toUpperCase() }
        });

        if (existingFlashSale) {
            await transaction.rollback();
            return res.redirect('/admin/flash-sales?error=Flash sale code already exists');
        }

        // Create flash sale
        const flashSale = await FlashSale.create({
            name,
            code: code.toUpperCase(),
            description,
            start_time: new Date(start_time),
            end_time: new Date(end_time),
            status: 'scheduled'
        }, { transaction });

        // Create tiers
        for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];

            await FlashSaleTier.create({
                flash_sale_id: flashSale.id,
                tier_name: tier.tier_name,
                member_limit: tier.member_limit,
                discount_percent: tier.discount_percent,
                tier_order: i + 1,
                used_count: 0,
                is_active: true
            }, { transaction });
        }

        await transaction.commit();
        res.redirect('/admin/flash-sales?success=Flash sale created successfully');

    } catch (error) {
        await transaction.rollback();
        console.error('Error creating flash sale:', error);
        res.redirect('/admin/flash-sales?error=Failed to create flash sale');
    }
});

// Update Flash Sale Status - POST
router.post('/flash-sales/:id/status', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'ended', 'scheduled'].includes(status)) {
            return res.redirect('/admin/flash-sales?error=Invalid status');
        }

        const flashSale = await FlashSale.findByPk(id);

        if (!flashSale) {
            return res.redirect('/admin/flash-sales?error=Flash sale not found');
        }

        await flashSale.update({ status });
        res.redirect('/admin/flash-sales?success=Flash sale status updated successfully');

    } catch (error) {
        console.error('Error updating flash sale status:', error);
        res.redirect('/admin/flash-sales?error=Failed to update flash sale status');
    }
});


// ✅ Edit/Update Flash Sale
// Edit/Update Flash Sale
router.post('/flash-sales/:id/update', adminAuth, async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { name, code, description, start_time, end_time } = req.body;

        // Parse tier arrays
        const tierNames = Array.isArray(req.body.tier_names)
            ? req.body.tier_names
            : [req.body.tier_names];
        const memberLimits = Array.isArray(req.body.member_limits)
            ? req.body.member_limits
            : [req.body.member_limits];
        const discountPercents = Array.isArray(req.body.discount_percents)
            ? req.body.discount_percents
            : [req.body.discount_percents];

        // Validate
        if (!name || !code || !start_time || !end_time || tierNames.length === 0) {
            await transaction.rollback();
            return res.redirect('/admin/flash-sales?error=Missing required fields');
        }

        // Update flash sale core
        await FlashSale.update({
            name,
            code: code.toUpperCase(),
            description,
            start_time: new Date(start_time),
            end_time: new Date(end_time)
        }, { where: { id }, transaction });

        // Fetch existing tiers
        const oldTiers = await FlashSaleTier.findAll({
            where: { flash_sale_id: id },
            transaction
        });
        const oldTierIds = oldTiers.map(t => t.id);

        // Delete any usages for those tiers
        if (oldTierIds.length) {
            await FlashSaleUsage.destroy({
                where: { tier_id: oldTierIds },
                transaction
            });
        }

        // Delete old tiers
        await FlashSaleTier.destroy({
            where: { flash_sale_id: id },
            transaction
        });

        // Recreate tiers
        for (let i = 0; i < tierNames.length; i++) {
            const tierName = tierNames[i];
            const limit = parseInt(memberLimits[i], 10);
            const discount = parseFloat(discountPercents[i]);
            if (!tierName || isNaN(limit) || isNaN(discount)) continue;

            await FlashSaleTier.create({
                flash_sale_id: id,
                tier_name: tierName,
                member_limit: limit,
                discount_percent: discount,
                tier_order: i + 1,
                used_count: 0,
                is_active: true
            }, { transaction });
        }

        await transaction.commit();
        res.redirect('/admin/flash-sales?success=Updated successfully');
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating flash sale:', error);
        res.redirect('/admin/flash-sales?error=Update failed');
    }
});



// ✅ Delete Flash Sale
// Delete Flash Sale
router.post('/flash-sales/:id/delete', adminAuth, async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        await FlashSaleTier.destroy({ where: { flash_sale_id: id }, transaction });
        await FlashSaleUsage.destroy({ where: { flash_sale_id: id }, transaction });
        await FlashSale.destroy({ where: { id }, transaction });
        await transaction.commit();
        res.redirect('/admin/flash-sales?success=Deleted successfully');
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting flash sale:', error);
        res.redirect('/admin/flash-sales?error=Deletion failed');
    }
});

// =================================================================
// MEGA OFFER FESTIVAL MANAGEMENT
// =================================================================

router.get('/mega-offer', adminAuth, async (req, res) => {
    try {
        const { MegaOfferFestival, MegaOfferTier, MegaOfferParticipant, MegaOfferTierEntry } = require('../models/models');

        const festivals = await MegaOfferFestival.findAll({
            include: [{
                model: MegaOfferTier,
                as: 'tiers',
                order: [['tier_order', 'ASC']]
            }],
            order: [['created_at', 'DESC']]
        });

        // Calculate statistics for each festival
        for (const festival of festivals) {
            const participants = await MegaOfferParticipant.count({ where: { festival_id: festival.id } });
            const winners = await MegaOfferParticipant.count({ where: { festival_id: festival.id, status: 'won' } });

            festival.statistics = {
                total_participants: participants,
                total_tiers: festival.tiers.length,
                total_winners: winners
            };
        }

        res.render('mega-offer-festivals', {
            title: 'Mega Offer Festival Management',
            festivals
        });
    } catch (error) {
        console.error('Error fetching mega offer festivals:', error);
        res.status(500).send('Error loading festivals page');
    }
});

// CREATE Festival
router.post('/mega-offer/create', adminAuth, async (req, res) => {
    try {
        const { MegaOfferFestival } = require('../models/models');
        const {
            name, description, start_time, end_time,
            pre_booking_start_time, pre_booking_end_time,
            pre_booking_amount, pre_booking_type
        } = req.body;

        if (!name || !start_time || !end_time || !pre_booking_start_time || !pre_booking_end_time || !pre_booking_amount) {
            return res.redirect('/admin/mega-offer?error=Missing required fields');
        }

        await MegaOfferFestival.create({
            name,
            description,
            start_time,
            end_time,
            pre_booking_start_time,
            pre_booking_end_time,
            pre_booking_amount: parseFloat(pre_booking_amount),
            pre_booking_type
        });

        res.redirect('/admin/mega-offer?success=Festival created successfully');
    } catch (error) {
        console.error('Error creating festival:', error);
        res.redirect('/admin/mega-offer?error=Failed to create festival');
    }
});

// UPDATE Festival Status
router.post('/mega-offer/:id/status', adminAuth, async (req, res) => {
    try {
        const { MegaOfferFestival } = require('../models/models');
        const { status } = req.body;
        const validStatuses = ['scheduled', 'active', 'ended', 'cancelled'];

        if (!validStatuses.includes(status)) {
            return res.redirect('/admin/mega-offer?error=Invalid status');
        }

        const festival = await MegaOfferFestival.findByPk(req.params.id);
        if (!festival) {
            return res.redirect('/admin/mega-offer?error=Festival not found');
        }

        await festival.update({ status });
        res.redirect('/admin/mega-offer?success=Festival status updated successfully');
    } catch (error) {
        console.error('Error updating festival status:', error);
        res.redirect('/admin/mega-offer?error=Failed to update status');
    }
});

// UPDATE Festival
router.post('/mega-offer/:id/update', adminAuth, async (req, res) => {
    try {
        const { MegaOfferFestival } = require('../models/models');
        const {
            name, description, start_time, end_time,
            pre_booking_start_time, pre_booking_end_time,
            pre_booking_amount, pre_booking_type
        } = req.body;

        const festival = await MegaOfferFestival.findByPk(req.params.id);
        if (!festival) {
            return res.redirect('/admin/mega-offer?error=Festival not found');
        }

        await festival.update({
            name,
            description,
            start_time,
            end_time,
            pre_booking_start_time,
            pre_booking_end_time,
            pre_booking_amount: parseFloat(pre_booking_amount),
            pre_booking_type
        });

        res.redirect('/admin/mega-offer?success=Festival updated successfully');
    } catch (error) {
        console.error('Error updating festival:', error);
        res.redirect('/admin/mega-offer?error=Failed to update festival');
    }
});

// DELETE Festival
router.post('/mega-offer/:id/delete', adminAuth, async (req, res) => {
    try {
        const { MegaOfferFestival } = require('../models/models');
        const festival = await MegaOfferFestival.findByPk(req.params.id);
        if (!festival) {
            return res.redirect('/admin/mega-offer?error=Festival not found');
        }

        await festival.destroy();
        res.redirect('/admin/mega-offer?success=Festival deleted successfully');
    } catch (error) {
        console.error('Error deleting festival:', error);
        res.redirect('/admin/mega-offer?error=Failed to delete festival');
    }
});

// ADD Tier to Festival
router.post('/mega-offer/:festivalId/tier/add', adminAuth, async (req, res) => {
    try {
        const { MegaOfferTier } = require('../models/models');
        const { tier_name, entry_fee, discount_percent, max_winners, tier_order, start_time, end_time } = req.body;

        if (!tier_name || !entry_fee || !discount_percent || !tier_order) {
            return res.redirect('/admin/mega-offer?error=Missing required tier fields');
        }

        // Helper to ensure IST if no timezone provided
        const toIST = (dateStr) => {
            if (!dateStr) return null;
            // If it's just YYYY-MM-DDTHH:mm, append +05:30
            if (dateStr.length === 16) return new Date(dateStr + '+05:30');
            return new Date(dateStr);
        };

        await MegaOfferTier.create({
            festival_id: req.params.festivalId,
            tier_name,
            entry_fee: parseFloat(entry_fee),
            discount_percent: parseInt(discount_percent),
            max_winners: max_winners ? parseInt(max_winners) : null,
            tier_order: parseInt(tier_order),
            start_time: toIST(start_time),
            end_time: toIST(end_time)
        });

        res.redirect('/admin/mega-offer?success=Tier added successfully');
    } catch (error) {
        console.error('Error adding tier:', error);
        res.redirect('/admin/mega-offer?error=Failed to add tier');
    }
});

// DELETE Tier
router.post('/mega-offer/:festivalId/tier/:tierId/delete', adminAuth, async (req, res) => {
    try {
        const { MegaOfferTier } = require('../models/models');
        const tier = await MegaOfferTier.findByPk(req.params.tierId);

        if (!tier) {
            return res.redirect('/admin/mega-offer?error=Tier not found');
        }

        await tier.destroy();
        res.redirect('/admin/mega-offer?success=Tier deleted successfully');
    } catch (error) {
        console.error('Error deleting tier:', error);
        res.redirect('/admin/mega-offer?error=Failed to delete tier');
    }
});

// GET Tier Entries (view who entered a tier)
router.get('/mega-offer/tier/:tierId/entries', adminAuth, async (req, res) => {
    try {
        const { MegaOfferTier, MegaOfferTierEntry, User } = require('../models/models');

        const tier = await MegaOfferTier.findByPk(req.params.tierId);
        if (!tier) {
            return res.status(404).json({ success: false, message: 'Tier not found' });
        }

        const entries = await MegaOfferTierEntry.findAll({
            where: { tier_id: req.params.tierId },
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }],
            order: [['created_at', 'ASC']]
        });

        res.json({
            success: true,
            tier: {
                id: tier.id,
                tier_name: tier.tier_name,
                discount_percent: tier.discount_percent,
                max_winners: tier.max_winners,
                status: tier.status
            },
            entries: entries.map(entry => ({
                id: entry.id,
                user_id: entry.user_id,
                user_name: entry.user ? `${entry.user.first_name} ${entry.user.last_name}` : 'Unknown User',
                user_email: entry.user ? entry.user.email : 'No Email',
                entry_fee_paid: entry.entry_fee_paid,
                status: entry.status,
                created_at: entry.created_at
            })),
            stats: {
                total_entries: entries.length,
                winners: entries.filter(e => e.status === 'won').length,
                losers: entries.filter(e => e.status === 'lost').length,
                pending: entries.filter(e => e.status === 'entered').length
            }
        });
    } catch (error) {
        console.error('Error fetching tier entries:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch entries' });
    }
});

// POST Manual Entry Status Update
router.post('/mega-offer/tier/:tierId/entry/:entryId/status', adminAuth, async (req, res) => {
    try {
        const { MegaOfferTierEntry, MegaOfferParticipant, MegaOfferTier, sequelize } = require('../models/models');
        const { status } = req.body; // 'won', 'lost', 'entered'

        if (!['won', 'lost', 'entered'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const entry = await MegaOfferTierEntry.findByPk(req.params.entryId);
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Entry not found' });
        }

        const tier = await MegaOfferTier.findByPk(req.params.tierId);
        if (!tier) {
            return res.status(404).json({ success: false, message: 'Tier not found' });
        }

        const t = await sequelize.transaction();

        try {
            // 1. Update Entry Status
            await entry.update({ status }, { transaction: t });

            // 2. Update Participant Status based on the new entry status
            const participant = await MegaOfferParticipant.findOne({
                where: {
                    user_id: entry.user_id,
                    festival_id: tier.festival_id
                },
                transaction: t
            });

            if (participant) {
                if (status === 'won') {
                    // If marking as WON, update participant to WON and set won_tier_id
                    await participant.update({
                        status: 'won',
                        won_tier_id: tier.id
                    }, { transaction: t });
                } else if (status === 'lost') {
                    // If marking as LOST
                    // Check if this user has won ANY other tier in this festival
                    // If not, revert participant status to 'registered' (or keep 'lost' if that's the global state preference, 
                    // but usually 'registered' implies they are still in the game for other tiers, unless they lost ALL)
                    // For now, let's say if they lose a tier, it doesn't affect global status unless they were previously marked as won for THIS tier.

                    if (participant.won_tier_id === tier.id) {
                        // They were previously the winner of THIS tier, but now marked as lost.
                        // Revert them to 'registered' and clear won_tier_id
                        await participant.update({
                            status: 'registered',
                            won_tier_id: null
                        }, { transaction: t });
                    }
                } else if (status === 'entered') {
                    // Resetting to pending
                    if (participant.won_tier_id === tier.id) {
                        await participant.update({
                            status: 'registered',
                            won_tier_id: null
                        }, { transaction: t });
                    }
                }
            }

            await t.commit();
            res.json({ success: true, message: `Status updated to ${status}` });

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error updating entry status:', error);
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
});

// POST Announce Winners for a tier
router.post('/mega-offer/tier/:tierId/announce-winners', adminAuth, async (req, res) => {
    try {
        const { MegaOfferTier, MegaOfferTierEntry, MegaOfferParticipant, sequelize } = require('../models/models');
        const { winnerCount } = req.body;

        const tier = await MegaOfferTier.findByPk(req.params.tierId);
        if (!tier) {
            return res.redirect('/admin/mega-offer?error=Tier not found');
        }

        const entries = await MegaOfferTierEntry.findAll({
            where: {
                tier_id: req.params.tierId,
                status: 'entered'
            }
        });

        if (entries.length === 0) {
            return res.redirect('/admin/mega-offer?error=No entries found for this tier');
        }

        const t = await sequelize.transaction();

        try {
            // Determine number of winners
            let countToSelect = winnerCount ? parseInt(winnerCount) : tier.max_winners;
            if (!countToSelect || countToSelect > entries.length) {
                countToSelect = Math.ceil(entries.length * 0.3); // Default: 30% winners
            }

            // Shuffle and select winners
            const shuffled = entries.sort(() => 0.5 - Math.random());
            const winners = shuffled.slice(0, countToSelect);
            const losers = shuffled.slice(countToSelect);

            // Update winners
            for (const winner of winners) {
                await winner.update({ status: 'won' }, { transaction: t });
                await MegaOfferParticipant.update(
                    { status: 'won', won_tier_id: tier.id },
                    { where: { user_id: winner.user_id, festival_id: tier.festival_id }, transaction: t }
                );
            }

            // Update losers
            for (const loser of losers) {
                await loser.update({ status: 'lost' }, { transaction: t });
            }

            // Update tier status
            await tier.update({ status: 'completed' }, { transaction: t });

            await t.commit();
            res.redirect('/admin/mega-offer?success=Winners announced successfully');
        } catch (error) {
            await t.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error announcing winners:', error);
        res.redirect('/admin/mega-offer?error=Failed to announce winners');
    }
});


// =================================================================
// MEGA OFFER ENTRIES ROUTE
// =================================================================
router.get('/mega-offer-entries', adminAuth, async (req, res) => {
    try {
        const { festival_id, tier_id, status } = req.query;

        // Fetch data for keys
        const festivals = await MegaOfferFestival.findAll({ order: [['created_at', 'DESC']] });
        const tiers = await MegaOfferTier.findAll({ order: [['tier_name', 'ASC']] });

        // Build Where Clause
        const where = {};
        if (status) where.status = status;
        if (tier_id) where.tier_id = tier_id;

        // Tier Include with optional Festival Filter
        const tierInclude = {
            model: MegaOfferTier,
            as: 'tier',
            include: [{
                model: MegaOfferFestival,
                as: 'festival',
                attributes: ['name']
            }]
        };

        if (festival_id) {
            tierInclude.where = { festival_id };
        }

        const entries = await MegaOfferTierEntry.findAll({
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['first_name', 'last_name', 'email']
                },
                tierInclude
            ],
            order: [['created_at', 'DESC']]
        });

        res.render('mega-offer-entries', {
            title: 'Mega Offer Entries',
            entries,
            festivals,
            tiers,
            filters: {
                festival_id: festival_id || '',
                tier_id: tier_id || '',
                status: status || ''
            }
        });
    } catch (error) {
        console.error('Error fetching mega offer entries:', error);
        res.status(500).send('Error fetching entries');
    }
});

// POST /admin/mega-offer-orders/update-status
router.post('/mega-offer-orders/update-status', adminAuth, async (req, res) => {
    try {
        const { order_id, shipping_status, payment_status } = req.body;
        const { MegaOfferOrder } = require('../models/models');

        const order = await MegaOfferOrder.findByPk(order_id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (shipping_status) order.shipping_status = shipping_status;
        if (payment_status) order.payment_status = payment_status; // Optional manual override

        await order.save();

        // Redirect back to referring page or json if via ajax
        res.redirect('back');
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).send('Server Error');
    }
});

// GET /admin/mega-offer-orders - List all Mega Offer Orders (Sale Orders)
router.get('/mega-offer-orders', adminAuth, async (req, res) => {
    try {
        const { festival_id, order_type, payment_status, shipping_status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const where = {};
        if (festival_id) where.festival_id = festival_id;
        if (order_type) where.order_type = order_type;
        if (payment_status) where.payment_status = payment_status;
        if (shipping_status) where.shipping_status = shipping_status;

        const { MegaOfferOrder, Address } = require('../models/models');

        const { count, rows: orders } = await MegaOfferOrder.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone_number'],
                    include: [{ model: Address }] // Fetch addresses
                },
                { model: MegaOfferFestival, as: 'festival', attributes: ['id', 'name'] },
                { model: Product, as: 'product', attributes: ['id', 'name'] }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset
        });

        // Fetch festivals for filter
        const festivals = await MegaOfferFestival.findAll({
            attributes: ['id', 'name'],
            order: [['created_at', 'DESC']]
        });

        res.render('admin/mega-offer-orders', {
            title: 'Mega Offer Orders',
            orders,
            festivals,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            totalOrders: count,
            filters: req.query,
            query: req.query // Pass query for pagination links
        });

    } catch (error) {
        console.error('Error fetching mega offer orders:', error);
        res.status(500).send('Server Error');
    }
});


// =================================================================
// PRE-BOOKINGS MANAGEMENT
// =================================================================

router.get('/pre-bookings', adminAuth, async (req, res) => {
    try {
        const { festival_id } = req.query;
        let whereClause = {
            has_pre_booked: true
        };

        if (festival_id) {
            whereClause.festival_id = festival_id;
        }

        const participants = await MegaOfferParticipant.findAll({
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['first_name', 'last_name', 'email', 'phone_number']
                },
                {
                    model: MegaOfferFestival,
                    as: 'festival',
                    attributes: ['id', 'name']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['name']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        const festivals = await MegaOfferFestival.findAll({
            attributes: ['id', 'name'],
            order: [['created_at', 'DESC']]
        });

        res.render('pre-bookings', {
            title: 'Manage Pre-bookings',
            participants,
            festivals,
            selectedFestivalId: festival_id
        });

    } catch (error) {
        console.error('Error fetching pre-bookings:', error);
        res.status(500).send("Error fetching pre-bookings.");
    }
});

router.post('/pre-bookings/give-gift', adminAuth, async (req, res) => {
    try {
        const { participant_id } = req.body;

        const participant = await MegaOfferParticipant.findByPk(participant_id);
        if (!participant) {
            return res.status(404).redirect('/admin/pre-bookings?error=Participant not found');
        }

        participant.mystery_gift_claimed = true;
        await participant.save();

        res.redirect('/admin/pre-bookings?success=Mystery Gift Awarded Successfully!');

    } catch (error) {
        console.error('Error giving mystery gift:', error);
        res.status(500).redirect('/admin/pre-bookings?error=Failed to award gift');
    }
});

module.exports = router;



