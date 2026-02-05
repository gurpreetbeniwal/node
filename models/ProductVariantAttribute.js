module.exports = (sequelize, DataTypes) => {
    const ProductVariantAttribute = sequelize.define('ProductVariantAttribute', {
        variant_id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, references: { model: 'product_variants', key: 'id' } },
        attribute_value_id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, references: { model: 'attribute_values', key: 'id' } }
    }, {
        tableName: 'product_variant_attributes',
        timestamps: false
    });
    return ProductVariantAttribute;
};