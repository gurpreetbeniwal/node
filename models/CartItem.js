module.exports = (sequelize, DataTypes) => {
    const CartItem = sequelize.define('CartItem', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        cart_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        product_variant_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
    }, {
        tableName: 'cart_items',
        timestamps: false
    });
    return CartItem;
};
