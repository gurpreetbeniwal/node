module.exports = (sequelize, DataTypes) => {
    const Cart = sequelize.define('Cart', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true }
    }, {
        tableName: 'carts',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });
    return Cart;
};
