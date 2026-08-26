from .models import ClothingItem, Outfit
from rest_framework import serializers

class ClothingItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClothingItem
        fields = [
            "id",
            "category",
            "season",
            "color",
            "image",
            "created_at",
            "updated_at",
        ]
        
class OutfitSerializer(serializers.ModelSerializer):
    items = ClothingItemSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Outfit
        fields = [
            "id",
            "name",
            "items",
            "created_at",
        ]