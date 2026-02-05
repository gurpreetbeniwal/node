module.exports = (sequelize, DataTypes) => {
    const ProductVariant = sequelize.define('ProductVariant', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        sku: { type: DataTypes.STRING(100), allowNull: false, unique: true },
        price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        stock_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    }, {
        tableName: 'product_variants',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false
    });

    // Define associations
    ProductVariant.associate = (models) => {
        // Many-to-Many relationship with AttributeValue through ProductVariantAttribute
        ProductVariant.belongsToMany(models.AttributeValue, {
            through: models.ProductVariantAttribute,
            foreignKey: 'product_variant_id',
            otherKey: 'attribute_value_id',
            as: 'AttributeValues'
        });

        // Belongs to Product
        ProductVariant.belongsTo(models.Product, {
            foreignKey: 'product_id',
            as: 'product'
        });

        // If you need direct access to the junction table records
        ProductVariant.hasMany(models.ProductVariantAttribute, {
            foreignKey: 'product_variant_id',
            as: 'variantAttributes'
        });
    };

    return ProductVariant;
};

