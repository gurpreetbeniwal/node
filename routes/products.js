const express = require('express');
const router = express.Router();
const db = require('../models/models'); // ✅ Import the db object
const { Op } = require('sequelize');


// ✅ Extract models from db for cleaner usage
const { Product, Category, ProductMedia, ProductVariant, AttributeValue, Attribute, ProductReview, users, sequelize } = db;

/**
 * @route GET /api/products/deals
 * @desc Get deal products - SPECIFIC ROUTES FIRST
 * @access Public
 */
router.get('/deals', async (req, res) => {
    try {
        console.log('📥 GET /products/deals called');

        const dealProducts = await Product.findAll({
            where: { is_published: true },
            limit: 4,
            order: [['created_at', 'DESC']],
            include: [
                {
                    model: Category,
                    as: 'Category',
                    attributes: ['name']
                },
                {
                    model: ProductMedia,
                    as: 'media',
                    attributes: ['url', 'media_type', 'sort_order'],
                    separate: true,
                    order: [['sort_order', 'ASC']]
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    attributes: ['price', 'stock_quantity'],
                    required: true // Ensure product has variants
                }
            ]
        });

        console.log('✅ Found deal products:', dealProducts.length);

        const formattedDeals = dealProducts.map(p => {
            const variant = p.variants && p.variants.length > 0 ? p.variants[0] : { price: 0, stock_quantity: 0 };
            const currentPrice = parseFloat(variant.price);
            const oldPrice = currentPrice * 1.25;
            const salePercentage = 20;
            const totalStock = variant.stock_quantity;
            const sold = Math.floor(totalStock * 0.4);
            const available = totalStock - sold;

            const dealEndsAt = new Date();
            dealEndsAt.setHours(dealEndsAt.getHours() + 24);

            const mediaImages = p.media?.filter(m => m.media_type === 'image') || [];
            const primaryImage = mediaImages.find(m => m.sort_order === 0) || mediaImages[0];

            return {
                id: p.id,
                title: p.name,
                category: p.Category?.name || 'Electronics',
                imgSrc: primaryImage?.url || 'https://via.placeholder.com/600x520/CCCCCC/FFFFFF?text=No+Image',
                price: currentPrice,
                oldPrice: oldPrice,
                salePercentage: `${salePercentage}%`,
                saveAmount: (oldPrice - currentPrice).toFixed(2),
                available: Math.max(available, 5),
                sold: Math.max(sold, 3),
                progressWidth: `${Math.min(Math.max((sold / totalStock) * 100, 20), 80)}%`,
                countdownTimer: dealEndsAt.getTime(),
            };
        });

        res.json({
            success: true,
            data: formattedDeals
        });

    } catch (error) {
        console.error('❌ API Error fetching deal products:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching deal products.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route GET /api/products/categories  
 * @desc Get a list of all product categories - SPECIFIC ROUTE BEFORE /:id
 * @access Public
 */
router.get('/categories', async (req, res) => {
    try {
        console.log('📂 GET /products/categories called');

        const categories = await Category.findAll({
            attributes: ['id', 'name', 'slug'],
            order: [['name', 'ASC']]
        });

        console.log(categories)

        console.log('✅ Found categories:', categories.length);

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('❌ API Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching categories.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});



router.get("/categories/with-sample-image", async (req, res) => {
    try {
        const [results] = await sequelize.query(`
      SELECT 
        c.id AS category_id,
        c.name AS category_name,
        pm.url AS image
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      LEFT JOIN product_media pm ON pm.product_id = p.id AND pm.media_type = 'image'
      WHERE p.is_published = 1
      GROUP BY c.id
    `);

        res.json(
            results.map((row) => ({
                id: row.category_id,
                name: row.category_name,
                image: row.image || null,
            }))
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

/**
 * @route GET /api/products/categories/active
 * @desc Get ONLY categories that have published products
 * @access Public
 */
router.get('/categories/active', async (req, res) => {
    try {
        console.log('📂 GET /products/categories/active called');

        // Find categories that have at least one published product
        const categories = await Category.findAll({
            attributes: ['id', 'name', 'slug'],
            include: [{
                model: Product,
                attributes: [], // We don't need product data, just existence
                where: { is_published: true },
                required: true // INNER JOIN: Only categories WITH products
            }],
            order: [['name', 'ASC']],
            group: ['Category.id'] // Ensure unique categories
        });

        console.log(`✅ Found ${categories.length} active categories`);

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('❌ API Error fetching active categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active categories.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route GET /api/products
 * @desc Get a list of all products with filtering, sorting, and pagination
 * @access Public
 */
router.get('/', async (req, res) => {
    try {
        console.log('📥 GET /products called with query:', req.query);

        const {
            categories,
            priceMin,
            priceMax,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            page = 1,
            limit = 6, // ✅ Changed default to 6
            search
        } = req.query;

        // ✅ Enforce minimum 6 products per page
        const itemsPerPage = Math.max(parseInt(limit, 10), 6);
        const currentPage = parseInt(page, 10);

        console.log('📊 Pagination settings:', {
            requestedLimit: limit,
            enforcedLimit: itemsPerPage,
            currentPage
        });

        // Build where conditions for Product
        const whereConditions = { is_published: true };

        if (categories) {
            const requestedCategoryIds = categories.split(',').map(id => parseInt(id.trim()));

            // Helper to get all descendant category IDs
            // We fetch all categories to build the tree in memory (efficient for < a few thousand categories)
            const allCategories = await Category.findAll({
                attributes: ['id', 'parent_id']
            });

            const expandedCategoryIds = new Set(requestedCategoryIds);
            const queue = [...requestedCategoryIds];

            while (queue.length > 0) {
                const currentId = queue.shift();
                // Find direct children of currentId
                const children = allCategories.filter(c => c.parent_id === currentId);

                for (const child of children) {
                    if (!expandedCategoryIds.has(child.id)) {
                        expandedCategoryIds.add(child.id);
                        queue.push(child.id); // Add to queue to find grandchilden
                    }
                }
            }

            console.log(`📂 Recursive Category Filter: Expanded [${requestedCategoryIds}] to [${Array.from(expandedCategoryIds)}]`);

            whereConditions.category_id = {
                [Op.in]: Array.from(expandedCategoryIds)
            };
        }

        if (search) {
            whereConditions.name = { [Op.like]: `%${search}%` };
        }

        console.log('🔍 Where conditions:', whereConditions);

        // Build include options
        const includeOptions = [
            {
                model: Category,
                as: 'Category',
                attributes: ['id', 'name', 'slug']
            },
            {
                model: ProductMedia,
                as: 'media',
                attributes: ['url', 'media_type', 'alt_text', 'sort_order'],
                separate: true,
                order: [['sort_order', 'ASC']]
            },
            {
                model: ProductVariant,
                as: 'variants',
                attributes: ['id', 'sku', 'price', 'stock_quantity'],
                required: true // Ensure product has variants
            }
        ];

        // Add price filtering to variants if needed
        if (priceMin || priceMax) {
            const variantWhere = {};
            if (priceMin) variantWhere.price = { [Op.gte]: parseFloat(priceMin) };
            if (priceMax) {
                variantWhere.price = {
                    ...variantWhere.price,
                    [Op.lte]: parseFloat(priceMax)
                };
            }
            includeOptions[2].where = variantWhere;
        }

        // Build order
        let orderOptions = [];
        if (sortBy === 'price') {
            orderOptions.push([{ model: ProductVariant, as: 'variants' }, 'price', sortOrder]);
        } else if (sortBy === 'name' || sortBy === 'title') {
            orderOptions.push(['name', sortOrder]);
        } else {
            orderOptions.push(['created_at', sortOrder]);
        }

        console.log('📊 Query options built');

        const { count, rows } = await Product.findAndCountAll({
            where: whereConditions,
            include: includeOptions,
            order: orderOptions,
            limit: itemsPerPage, // ✅ Use enforced minimum
            offset: (currentPage - 1) * itemsPerPage,
            distinct: true,
            subQuery: false
        });

        console.log('✅ Found products:', rows.length, 'out of', count, 'total');

        // ✅ Additional check: If we got fewer products than expected and more exist
        if (rows.length < itemsPerPage && count > (currentPage - 1) * itemsPerPage + rows.length) {
            console.log('⚠️ Got fewer products than requested, checking for additional products...');

            // Try to fetch additional products to meet minimum
            const additionalNeeded = itemsPerPage - rows.length;
            const additionalProducts = await Product.findAll({
                where: whereConditions,
                include: includeOptions.map(inc => ({ ...inc, separate: false })), // Remove separate for additional query
                order: orderOptions,
                limit: additionalNeeded,
                offset: rows.length, // Start from where we left off
                distinct: true,
                subQuery: false
            });

            console.log('📦 Found additional products:', additionalProducts.length);
            rows.push(...additionalProducts);
        }

        // Transform products to frontend format
        const transformedProducts = rows.map((product, index) => {
            const variantPrices = product.variants?.map(v => parseFloat(v.price)) || [];
            const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : 0;
            const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : 0;

            const mediaImages = product.media?.filter(m => m.media_type === 'image') || [];
            const primaryImage = mediaImages.find(m => m.sort_order === 0) || mediaImages[0];
            const hoverImage = mediaImages.find(m => m.sort_order === 1) || mediaImages[1] || primaryImage;

            const hasDiscount = variantPrices.length > 1 && maxPrice > minPrice;

            return {
                id: product.id,
                wowDelay: `${(index % 5) * 0.1}s`,
                imgSrc: primaryImage?.url || 'https://via.placeholder.com/600x520/CCCCCC/FFFFFF?text=No+Image',
                imgHover: hoverImage?.url || primaryImage?.url || 'https://via.placeholder.com/600x520/CCCCCC/FFFFFF?text=No+Image',
                thumbImages: mediaImages.map(img => img.url),
                width: 500,
                height: 500,
                category: product.Category?.name || 'Electronics',
                title: product.name,
                price: minPrice,
                oldPrice: hasDiscount ? maxPrice : null,
                slug: product.slug,
                brand: product.brand,
                is_published: product.is_published,
                salePercentage: hasDiscount ? `${Math.round(((maxPrice - minPrice) / maxPrice) * 100)}%` : null,
                saveAmount: hasDiscount ? (maxPrice - minPrice).toFixed(2) : null,
                inStock: product.variants?.[0]?.stock_quantity > 0,
                stockQuantity: product.variants?.[0]?.stock_quantity || 0,
                rating: parseFloat((4.0 + (Math.random() * 1)).toFixed(1)),
                filterBrands: product.brand ? [product.brand] : [],
                variants: product.variants?.map(variant => ({
                    id: variant.id,
                    sku: variant.sku,
                    price: parseFloat(variant.price),
                    stock: variant.stock_quantity
                })) || []
            };
        });

        // ✅ Calculate proper pagination based on enforced limit
        const totalPages = Math.ceil(count / itemsPerPage);

        console.log('📄 Pagination info:', {
            showing: transformedProducts.length,
            total: count,
            pages: totalPages,
            currentPage: currentPage
        });

        res.json({
            success: true,
            data: transformedProducts,
            pagination: {
                page: currentPage,
                limit: itemsPerPage, // ✅ Return actual limit used
                total: count,
                pages: totalPages,
                showing: transformedProducts.length, // ✅ Add showing count
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            }
        });

    } catch (error) {
        console.error('❌ API Error fetching products:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Error fetching products.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


/**
 * @route GET /api/products/:id
 * @desc Get the full details for a single product
 * @access Public
 */
router.get('/:id', async (req, res) => {
    try {
        console.log('📥 GET /products/:id called with ID:', req.params.id);

        const product = await Product.findByPk(req.params.id, {
            include: [
                {
                    model: ProductMedia,
                    as: 'media',
                    attributes: ['url', 'media_type', 'alt_text', 'sort_order'],
                    separate: true,
                    order: [['sort_order', 'ASC']]
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    attributes: ['id', 'sku', 'price', 'stock_quantity'],
                    include: [
                        {
                            model: AttributeValue,
                            as: 'AttributeValues',
                            through: { attributes: [] },
                            include: [{
                                model: Attribute,
                                as: 'Attribute',
                                attributes: ['name']
                            }]
                        }
                    ]
                },
                {
                    model: Category,
                    as: 'Category',
                    attributes: ['id', 'name', 'slug']
                }
            ]
        });

        if (!product || !product.is_published) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        console.log('✅ Found product:', product.name);

        // Transform for frontend
        const variantPrices = product.variants?.map(v => parseFloat(v.price)) || [];
        const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : 0;
        const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : 0;
        const mediaImages = product.media?.filter(m => m.media_type === 'image') || [];
        const primaryImage = mediaImages.find(m => m.sort_order === 0) || mediaImages[0];

        const transformedProduct = {
            id: product.id,
            title: product.name,
            slug: product.slug,
            description: product.description,
            brand: product.brand,
            category: product.Category?.name || 'Electronics',
            categoryId: product.Category?.id,
            price: minPrice,
            oldPrice: variantPrices.length > 1 ? maxPrice : null,
            imgSrc: primaryImage?.url || 'https://via.placeholder.com/600x520/CCCCCC/FFFFFF?text=No+Image',
            thumbImages: mediaImages.map(img => img.url),
            inStock: product.variants?.[0]?.stock_quantity > 0,
            stockQuantity: product.variants?.[0]?.stock_quantity || 0,
            rating: parseFloat((4.0 + (Math.random() * 1)).toFixed(1)),
            variants: product.variants?.map(variant => ({
                id: variant.id,
                sku: variant.sku,
                price: parseFloat(variant.price),
                stock: variant.stock_quantity,
                attributes: variant.AttributeValues?.map(av => ({
                    name: av.Attribute?.name,
                    value: av.value
                })) || []
            })) || []
        };

        res.json({
            success: true,
            data: transformedProduct
        });

    } catch (error) {
        console.error(`❌ API Error fetching product ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Error fetching product details.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});



// ✅ Get products from same category
router.get('/:productId/category-products', async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 8, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;

        console.log('📦 GET /products/:productId/category-products called for product:', productId);

        // First, get the current product to find its category
        const currentProduct = await Product.findByPk(productId, {
            attributes: ['id', 'category_id', 'name'],
            include: [{
                model: Category,
                as: 'Category',
                attributes: ['id', 'name']
            }]
        });

        if (!currentProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        console.log('🔍 Current product:', {
            id: currentProduct.id,
            name: currentProduct.name,
            categoryId: currentProduct.category_id,
            category: currentProduct.Category?.name
        });

        // ✅ Get all products from the same category (excluding current product)
        const whereConditions = {
            is_published: true,
            category_id: currentProduct.category_id,
            id: { [Op.ne]: parseInt(productId) } // Exclude current product
        };

        // Build include options
        const includeOptions = [
            {
                model: Category,
                as: 'Category',
                attributes: ['id', 'name', 'slug']
            },
            {
                model: ProductMedia,
                as: 'media',
                attributes: ['url', 'media_type', 'alt_text', 'sort_order'],
                separate: true,
                order: [['sort_order', 'ASC']]
            },
            {
                model: ProductVariant,
                as: 'variants',
                attributes: ['id', 'sku', 'price', 'stock_quantity'],
                required: true
            }
        ];

        // ✅ Simple ordering - no randomization, just regular sort
        let orderOptions = [];

        if (sortBy === 'price') {
            orderOptions.push([{ model: ProductVariant, as: 'variants' }, 'price', sortOrder]);
        } else if (sortBy === 'name' || sortBy === 'title') {
            orderOptions.push(['name', sortOrder]);
        } else {
            orderOptions.push(['created_at', sortOrder]);
        }

        console.log('🔍 Querying category products with conditions:', whereConditions);

        // ✅ Find products from same category
        const categoryProducts = await Product.findAll({
            where: whereConditions,
            include: includeOptions,
            order: orderOptions,
            limit: parseInt(limit),
            distinct: true,
            subQuery: false
        });

        console.log('✅ Found category products:', categoryProducts.length);

        // ✅ If no products found in category, return empty array
        if (categoryProducts.length === 0) {
            return res.json({
                success: true,
                products: [],
                meta: {
                    currentProduct: {
                        id: currentProduct.id,
                        name: currentProduct.name,
                        category: currentProduct.Category?.name,
                        categoryId: currentProduct.category_id
                    },
                    total: 0,
                    limit: parseInt(limit),
                    type: 'category',
                    message: `No other products found in ${currentProduct.Category?.name} category`
                }
            });
        }

        // Transform products to frontend format
        const transformedProducts = categoryProducts.map((product, index) => {
            const variantPrices = product.variants?.map(v => parseFloat(v.price)) || [];
            const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : 0;
            const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : 0;

            const mediaImages = product.media?.filter(m => m.media_type === 'image') || [];
            const primaryImage = mediaImages.find(m => m.sort_order === 0) || mediaImages[0];
            const hoverImage = mediaImages.find(m => m.sort_order === 1) || mediaImages[1] || primaryImage;

            const hasDiscount = variantPrices.length > 1 && maxPrice > minPrice;

            return {
                id: product.id,
                wowDelay: `${(index % 4) * 0.1}s`,
                imgSrc: primaryImage?.url || 'https://via.placeholder.com/600x520/CCCCCC/FFFFFF?text=No+Image',
                imgHover: hoverImage?.url || primaryImage?.url || 'https://via.placeholder.com/600x520/CCCCCC/FFFFFF?text=No+Image',
                thumbImages: mediaImages.map(img => img.url),
                width: 500,
                height: 500,
                category: product.Category?.name || 'Electronics',
                categoryId: product.category_id,
                title: product.name,
                name: product.name,
                price: minPrice,
                oldPrice: hasDiscount ? maxPrice : null,
                slug: product.slug,
                brand: product.brand,
                is_published: product.is_published,
                salePercentage: hasDiscount ? Math.round(((maxPrice - minPrice) / maxPrice) * 100) : null,
                saveAmount: hasDiscount ? (maxPrice - minPrice).toFixed(2) : null,
                inStock: product.variants?.[0]?.stock_quantity > 0,
                stockQuantity: product.variants?.[0]?.stock_quantity || 0,
                rating: parseFloat((4.0 + (Math.random() * 1)).toFixed(1)),
                reviewCount: Math.floor(Math.random() * 50) + 5,
                filterBrands: product.brand ? [product.brand] : [],
                variants: product.variants?.map(variant => ({
                    id: variant.id,
                    sku: variant.sku,
                    price: parseFloat(variant.price),
                    stock: variant.stock_quantity
                })) || []
            };
        });

        res.json({
            success: true,
            products: transformedProducts,
            meta: {
                currentProduct: {
                    id: currentProduct.id,
                    name: currentProduct.name,
                    category: currentProduct.Category?.name,
                    categoryId: currentProduct.category_id
                },
                total: transformedProducts.length,
                limit: parseInt(limit),
                type: 'category',
                message: `Found ${transformedProducts.length} products in ${currentProduct.Category?.name} category`
            }
        });

    } catch (error) {
        console.error('❌ Error fetching category products:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch category products',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});








module.exports = router;
