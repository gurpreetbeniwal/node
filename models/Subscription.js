module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    start_date: { type: DataTypes.DATE, allowNull: false },
    end_date:   { type: DataTypes.DATE, allowNull: false },
    status:     {
      type: DataTypes.ENUM('active','expired','cancelled'),
      defaultValue: 'active', allowNull: false
    },
    payment_reference: { type: DataTypes.STRING, allowNull: true }
  }, {
    tableName: 'subscriptions',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Define associations here
  Subscription.associate = models => {
    Subscription.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE', onUpdate: 'CASCADE'
    });
    Subscription.belongsTo(models.SubscriptionPlan, {
      foreignKey: 'plan_id',
      as: 'plan',
      onDelete: 'CASCADE', onUpdate: 'CASCADE'
    });
  };

  return Subscription;
};
