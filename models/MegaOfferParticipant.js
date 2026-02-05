module.exports = (sequelize, DataTypes) => {
    const MegaOfferParticipant = sequelize.define('MegaOfferParticipant', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        festival_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'mega_offer_festivals',
                key: 'id'
            }
        },
        user_id: {
            type: DataTypes.INTEGER, // Assuming User ID is INTEGER based on User.js
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        has_pre_booked: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        pre_booking_amount_paid: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.00,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('registered', 'won', 'lost'),
            defaultValue: 'registered',
            allowNull: false
        },
        won_tier_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'mega_offer_tiers',
                key: 'id'
            }
        },
        mystery_gift_claimed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'products',
                key: 'id'
            }
        }
    }, {
        tableName: 'mega_offer_participants',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['festival_id', 'user_id', 'product_id']
            }
        ]
    });

    MegaOfferParticipant.associate = models => {
        models.MegaOfferParticipant.belongsTo(models.MegaOfferFestival, {
            foreignKey: 'festival_id',
            as: 'festival'
        });
        models.MegaOfferParticipant.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user'
        });
        models.MegaOfferParticipant.belongsTo(models.MegaOfferTier, {
            foreignKey: 'won_tier_id',
            as: 'wonTier'
        });
        models.MegaOfferParticipant.belongsTo(models.Product, {
            foreignKey: 'product_id',
            as: 'product'
        });
    };

    return MegaOfferParticipant;
};
