module.exports = (sequelize, DataTypes) => {
    const MegaOfferOrder = sequelize.define('MegaOfferOrder', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false
        },
        festival_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        product_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false
        },
        order_type: {
            type: DataTypes.ENUM('win_claim', 'mystery_gift'),
            allowNull: false,
            comment: 'Whether this is a tier win claim or a mystery gift claim'
        },
        original_price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        pre_booking_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        discount_amount: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00
        },
        final_amount_paid: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        payment_status: {
            type: DataTypes.ENUM('pending', 'paid', 'failed'),
            defaultValue: 'pending'
        },
        payment_reference: {
            type: DataTypes.STRING,
            allowNull: true
        },
        shipping_status: {
            type: DataTypes.ENUM('processing', 'shipped', 'delivered'),
            defaultValue: 'processing'
        }
    }, {
        tableName: 'mega_offer_orders',
        underscored: true,
        timestamps: true
    });

    MegaOfferOrder.associate = models => {
        MegaOfferOrder.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        MegaOfferOrder.belongsTo(models.MegaOfferFestival, { foreignKey: 'festival_id', as: 'festival' });
        MegaOfferOrder.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    };

    return MegaOfferOrder;
};
