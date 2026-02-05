module.exports = (sequelize, DataTypes) => {
    const MegaOfferFestival = sequelize.define('MegaOfferFestival', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING(150),
            allowNull: false,
            comment: 'Festival display name'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Festival description'
        },
        start_time: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'Festival start time'
        },
        end_time: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'Festival end time'
        },
        pre_booking_start_time: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'When pre-booking opens'
        },
        pre_booking_end_time: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'When pre-booking closes'
        },
        pre_booking_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Amount or percentage value'
        },
        pre_booking_type: {
            type: DataTypes.ENUM('fixed', 'percentage'),
            defaultValue: 'fixed',
            allowNull: false,
            comment: 'Type of pre-booking amount'
        },
        status: {
            type: DataTypes.ENUM('scheduled', 'active', 'ended', 'cancelled'),
            defaultValue: 'scheduled',
            allowNull: false
        }
    }, {
        tableName: 'mega_offer_festivals',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    MegaOfferFestival.associate = models => {
        models.MegaOfferFestival.hasMany(models.MegaOfferTier, {
            foreignKey: 'festival_id',
            as: 'tiers',
            onDelete: 'CASCADE'
        });
        models.MegaOfferFestival.hasMany(models.MegaOfferParticipant, {
            foreignKey: 'festival_id',
            as: 'participants',
            onDelete: 'CASCADE'
        });
    };

    return MegaOfferFestival;
};
