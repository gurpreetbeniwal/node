module.exports = (sequelize, DataTypes) => {
    const MegaOfferTier = sequelize.define('MegaOfferTier', {
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
        tier_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: 'Tier display name e.g. Tier 1'
        },
        tier_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Sequence order of the tier'
        },
        entry_fee: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Fee to enter this tier'
        },
        discount_percent: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 100
            },
            comment: 'Discount percentage for winners'
        },
        max_winners: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Number of winners for this tier. Null means unlimited or manual.'
        },
        start_time: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'When this tier becomes available'
        },
        end_time: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'When this tier closes'
        },
        status: {
            type: DataTypes.ENUM('pending', 'active', 'completed'),
            defaultValue: 'pending',
            allowNull: false
        }
    }, {
        tableName: 'mega_offer_tiers',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    MegaOfferTier.associate = models => {
        models.MegaOfferTier.belongsTo(models.MegaOfferFestival, {
            foreignKey: 'festival_id',
            as: 'festival'
        });
        models.MegaOfferTier.hasMany(models.MegaOfferTierEntry, {
            foreignKey: 'tier_id',
            as: 'entries',
            onDelete: 'CASCADE'
        });
    };

    return MegaOfferTier;
};
