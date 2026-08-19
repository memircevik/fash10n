from .models import ClothingItem
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