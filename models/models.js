const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Import existing models
const User = require('./User')(sequelize, DataTypes);
const Address = require('./Address')(sequelize, DataTypes);
const Category = require('./Category')(sequelize, DataTypes);
const Product = require('./Product')(sequelize, DataTypes);
const ProductVariant = require('./ProductVariant')(sequelize, DataTypes);
const Attribute = require('./Attribute')(sequelize, DataTypes);
const AttributeValue = require('./AttributeValue')(sequelize, DataTypes);
const ProductVariantAttribute = require('./ProductVariantAttribute')(sequelize, DataTypes);
const ProductMedia = require('./ProductMedia')(sequelize, DataTypes);
const ProductReview = require('./ProductReview')(sequelize, DataTypes);
const Cart = require('./Cart')(sequelize, DataTypes);
const CartItem = require('./CartItem')(sequelize, DataTypes);
const Order = require('./Order')(sequelize, DataTypes);
const OrderItem = require('./OrderItem')(sequelize, DataTypes);
const Setting = require('./Setting')(sequelize, DataTypes);
const Coupon = require('./Coupon')(sequelize, DataTypes);

// Import new models
const SubscriptionPlan = require('./SubscriptionPlan')(sequelize, DataTypes);
const Subscription = require('./Subscription')(sequelize, DataTypes);
const FlashSale = require('./FlashSale')(sequelize, DataTypes);
const FlashSaleTier = require('./FlashSaleTier')(sequelize, DataTypes);
const FlashSaleUsage = require('./FlashSaleUsage')(sequelize, DataTypes);
const Influencer = require('./Influencer')(sequelize, DataTypes);
const SubscriptionPurchase = require('./SubscriptionPurchase')(sequelize, DataTypes);
const MegaOfferFestival = require('./MegaOfferFestival')(sequelize, DataTypes);
const MegaOfferTier = require('./MegaOfferTier')(sequelize, DataTypes);
const MegaOfferParticipant = require('./MegaOfferParticipant')(sequelize, DataTypes);
const MegaOfferTierEntry = require('./MegaOfferTierEntry')(sequelize, DataTypes);
const MegaOfferOrder = require('./MegaOfferOrder')(sequelize, DataTypes);

// --- Define Associations ---

// User & Address
User.hasMany(Address, { foreignKey: 'user_id' });
Address.belongsTo(User, { foreignKey: 'user_id' });

// Category (self-referencing)
Category.hasMany(Category, { as: 'children', foreignKey: 'parent_id' });
Category.belongsTo(Category, { as: 'parent', foreignKey: 'parent_id' });

// Category & Product
Category.hasMany(Product, { foreignKey: 'category_id' });
Product.belongsTo(Category, { foreignKey: 'category_id' });

// Product & Variants
Product.hasMany(ProductVariant, { foreignKey: 'product_id', as: 'variants' });
ProductVariant.belongsTo(Product, { foreignKey: 'product_id' });

// Product & Media
Product.hasMany(ProductMedia, { foreignKey: 'product_id', as: 'media' });
ProductMedia.belongsTo(Product, { foreignKey: 'product_id' });

// Reviews
Product.hasMany(ProductReview, { foreignKey: 'product_id' });
ProductReview.belongsTo(Product, { foreignKey: 'product_id' });
User.hasMany(ProductReview, { foreignKey: 'user_id' });
ProductReview.belongsTo(User, { foreignKey: 'user_id' });

// Variants & Attributes (M:N)
ProductVariant.belongsToMany(AttributeValue, {
  through: ProductVariantAttribute,
  foreignKey: 'variant_id'
});
AttributeValue.belongsToMany(ProductVariant, {
  through: ProductVariantAttribute,
  foreignKey: 'attribute_value_id'
});

// Attribute hierarchy
Attribute.hasMany(AttributeValue, { foreignKey: 'attribute_id' });
AttributeValue.belongsTo(Attribute, { foreignKey: 'attribute_id' });

// Cart & User
User.hasOne(Cart, { foreignKey: 'user_id' });
Cart.belongsTo(User, { foreignKey: 'user_id' });

// Cart & Items
Cart.hasMany(CartItem, { foreignKey: 'cart_id' });
CartItem.belongsTo(Cart, { foreignKey: 'cart_id' });

// CartItem & Variant
ProductVariant.hasMany(CartItem, { foreignKey: 'product_variant_id' });
CartItem.belongsTo(ProductVariant, { foreignKey: 'product_variant_id' });

// Order & User
User.hasMany(Order, { foreignKey: 'user_id' });
Order.belongsTo(User, { foreignKey: 'user_id' });

// Order & Items
Order.hasMany(OrderItem, { foreignKey: 'order_id' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id' });

// OrderItem & Variant
ProductVariant.hasMany(OrderItem, { foreignKey: 'product_variant_id' });
OrderItem.belongsTo(ProductVariant, { foreignKey: 'product_variant_id' });

// Order & Address
Order.belongsTo(Address, {
  foreignKey: 'shipping_address_id',
  as: 'ShippingAddress'
});

// --- New Subscription System Associations ---

// Plans & Subscriptions
SubscriptionPlan.hasMany(Subscription, {
  foreignKey: 'plan_id',
  as: 'subscriptions'
});
Subscription.belongsTo(SubscriptionPlan, {
  foreignKey: 'plan_id',
  as: 'plan'
});

// User & Subscriptions
User.hasMany(Subscription, {
  foreignKey: 'user_id',
  as: 'subscriptions'
});
Subscription.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// --- Influencer & Subscription Purchase Associations ---

// Influencer & SubscriptionPurchase
Influencer.hasMany(SubscriptionPurchase, { foreignKey: 'influencer_id', as: 'purchases' });
SubscriptionPurchase.belongsTo(Influencer, { foreignKey: 'influencer_id', as: 'influencer' });

// User & SubscriptionPurchase
User.hasMany(SubscriptionPurchase, { foreignKey: 'user_id', as: 'subscriptionPurchases' });
SubscriptionPurchase.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Plan & SubscriptionPurchase
SubscriptionPlan.hasMany(SubscriptionPurchase, { foreignKey: 'plan_id', as: 'purchases' });
SubscriptionPurchase.belongsTo(SubscriptionPlan, { foreignKey: 'plan_id', as: 'plan' });


// --- Flash Sales System Associations ---



FlashSaleUsage.belongsTo(FlashSaleTier, { foreignKey: 'tier_id', as: 'tier' });
FlashSaleTier.hasMany(FlashSaleUsage, { foreignKey: 'tier_id', as: 'flashSaleUsages' });

FlashSaleUsage.belongsTo(FlashSale, { foreignKey: 'flash_sale_id', as: 'flashSale' });
FlashSale.hasMany(FlashSaleUsage, { foreignKey: 'flash_sale_id', as: 'flashSaleUsages' });


// FlashSale & Tiers
FlashSale.hasMany(FlashSaleTier, {
  foreignKey: 'flash_sale_id',
  as: 'tiers'
});
FlashSaleTier.belongsTo(FlashSale, {
  foreignKey: 'flash_sale_id',
  as: 'flashSale'
});

Order.belongsTo(FlashSaleUsage, {
  foreignKey: 'flash_usage_id',
  as: 'flashSaleUsage'
});

FlashSaleUsage.hasOne(Order, {
  foreignKey: 'flash_usage_id',
  as: 'order'
});




// ✅ REMOVED FlashSaleUsage associations since model is commented out

// --- Mega Offer Festival Associations ---

// Festival & Tiers
MegaOfferFestival.hasMany(MegaOfferTier, { foreignKey: 'festival_id', as: 'tiers' });
MegaOfferTier.belongsTo(MegaOfferFestival, { foreignKey: 'festival_id', as: 'festival' });

// Festival & Participants
MegaOfferFestival.hasMany(MegaOfferParticipant, { foreignKey: 'festival_id', as: 'participants' });
MegaOfferParticipant.belongsTo(MegaOfferFestival, { foreignKey: 'festival_id', as: 'festival' });

// Tier & Entries
MegaOfferTier.hasMany(MegaOfferTierEntry, { foreignKey: 'tier_id', as: 'entries' });
MegaOfferTierEntry.belongsTo(MegaOfferTier, { foreignKey: 'tier_id', as: 'tier' });

// Participant & User
User.hasMany(MegaOfferParticipant, { foreignKey: 'user_id', as: 'megaOfferParticipations' });
MegaOfferParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Participant & Won Tier
MegaOfferParticipant.belongsTo(MegaOfferTier, { foreignKey: 'won_tier_id', as: 'wonTier' });

// Participant & Product
MegaOfferParticipant.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// TierEntry & User
User.hasMany(MegaOfferTierEntry, { foreignKey: 'user_id', as: 'megaOfferTierEntries' });
MegaOfferTierEntry.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// MegaOfferOrder Associations
MegaOfferOrder.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(MegaOfferOrder, { foreignKey: 'user_id', as: 'megaOfferOrders' });

MegaOfferOrder.belongsTo(MegaOfferFestival, { foreignKey: 'festival_id', as: 'festival' });
MegaOfferFestival.hasMany(MegaOfferOrder, { foreignKey: 'festival_id', as: 'orders' });

MegaOfferOrder.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(MegaOfferOrder, { foreignKey: 'product_id', as: 'megaOfferOrders' });

// Export all models and sequelize instance
const db = {
  sequelize,
  Sequelize,
  User,
  Address,
  Category,
  Product,
  ProductVariant,
  Attribute,
  AttributeValue,
  ProductVariantAttribute,
  ProductMedia,
  ProductReview,
  Cart,
  CartItem,
  Order,
  OrderItem,
  Setting,
  Coupon,
  SubscriptionPlan,
  Subscription,
  FlashSale,
  FlashSaleTier,
  FlashSaleUsage,
  Influencer,
  SubscriptionPurchase,
  MegaOfferFestival,
  MegaOfferTier,
  MegaOfferParticipant,
  MegaOfferTierEntry,
  MegaOfferOrder
};

module.exports = db;
