module.exports = (sequelize, DataTypes) => {
    const MegaOfferTierEntry = sequelize.define('MegaOfferTierEntry', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        tier_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'mega_offer_tiers',
                key: 'id'
            }
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        entry_fee_paid: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Amount paid to enter this tier'
        },
        status: {
            type: DataTypes.ENUM('entered', 'won', 'lost'),
            defaultValue: 'entered',
            allowNull: false
        }
    }, {
        tableName: 'mega_offer_tier_entries',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['tier_id', 'user_id']
            }
        ]
    });

    MegaOfferTierEntry.associate = models => {
        models.MegaOfferTierEntry.belongsTo(models.MegaOfferTier, {
            foreignKey: 'tier_id',
            as: 'tier'
        });
        models.MegaOfferTierEntry.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user'
        });
    };

    return MegaOfferTierEntry;
};
