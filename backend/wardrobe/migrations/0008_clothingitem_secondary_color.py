# Generated manually on 2026-09-02

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wardrobe', '0007_clothingitem_accessory_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='clothingitem',
            name='secondary_color',
            field=models.CharField(
                blank=True,
                default='',
                max_length=100,
            ),
        ),
    ]
