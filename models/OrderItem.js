module.exports = (sequelize, DataTypes) => {
    const OrderItem = sequelize.define('OrderItem', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        product_variant_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        price_at_purchase: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        product_name_snapshot: { type: DataTypes.STRING, allowNull: false },
        variant_attributes_snapshot: { type: DataTypes.JSON, allowNull: true }
    }, {
        tableName: 'order_items',
        timestamps: false
    });
    return OrderItem;
};
