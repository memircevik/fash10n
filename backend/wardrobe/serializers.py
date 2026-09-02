import json

from rest_framework import serializers

from .models import ClothingItem, Outfit

VALID_SEASONS = {
    "spring",
    "summer",
    "fall",
    "winter",
}


class SeasonField(serializers.Field):
    def to_representation(self, value):
        if isinstance(value, list):
            return value

        if not value:
            return []

        try:
            parsed = json.loads(value)

            if isinstance(parsed, list):
                return parsed

        except (json.JSONDecodeError, TypeError):
            pass

        return [value]

    def to_internal_value(self, data):
        if isinstance(data, list):
            seasons = data

        elif isinstance(data, str):
            try:
                parsed = json.loads(data)

                if isinstance(parsed, list):
                    seasons = parsed
                else:
                    seasons = [data]

            except json.JSONDecodeError:
                seasons = [item.strip() for item in data.split(",") if item.strip()]

        else:
            raise serializers.ValidationError("Mevsim bilgisi geçersiz.")

        cleaned = []

        for season in seasons:
            if not isinstance(season, str):
                raise serializers.ValidationError("Geçersiz mevsim bilgisi.")

            season = season.strip().lower()

            if season not in VALID_SEASONS:
                raise serializers.ValidationError(f"Geçersiz mevsim: {season}")

            if season not in cleaned:
                cleaned.append(season)

        if not cleaned:
            raise serializers.ValidationError("En az bir mevsim seçmelisin.")

        return json.dumps(cleaned, separators=(",", ":"))


VALID_ACCESSORY_TYPES = {
    "watch",
    "sunglasses",
    "eyewear",
    "bag",
    "belt",
    "hat",
    "scarf",
    "tie",
    "jewelry",
    "other",
}


class ClothingItemSerializer(serializers.ModelSerializer):
    season = SeasonField()

    accessory_type = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    secondary_color = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = ClothingItem

        fields = [
            "id",
            "category",
            "season",
            "color",
            "secondary_color",
            "description",
            "accessory_type",
            "image",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        category = attrs.get(
            "category",
            getattr(self.instance, "category", None),
        )

        accessory_type = attrs.get("accessory_type", "")

        if category == "accessory":
            if accessory_type and accessory_type not in VALID_ACCESSORY_TYPES:
                raise serializers.ValidationError(
                    {"accessory_type": f"Geçersiz aksesuar tipi: {accessory_type}"}
                )
        else:
            # accessory_type yalnızca accessory kategorisinde anlamlıdır.
            attrs["accessory_type"] = ""

        return attrs


class OutfitSerializer(serializers.ModelSerializer):
    items = ClothingItemSerializer(many=True, read_only=True)

    class Meta:
        model = Outfit

        fields = [
            "id",
            "name",
            "items",
            "created_at",
        ]
