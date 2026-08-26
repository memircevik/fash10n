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
                seasons = [
                    item.strip()
                    for item in data.split(",")
                    if item.strip()
                ]

        else:
            raise serializers.ValidationError(
                "Mevsim bilgisi geçersiz."
            )

        cleaned = []

        for season in seasons:
            if not isinstance(season, str):
                raise serializers.ValidationError(
                    "Geçersiz mevsim bilgisi."
                )

            season = season.strip().lower()

            if season not in VALID_SEASONS:
                raise serializers.ValidationError(
                    f"Geçersiz mevsim: {season}"
                )

            if season not in cleaned:
                cleaned.append(season)

        if not cleaned:
            raise serializers.ValidationError(
                "En az bir mevsim seçmelisin."
            )

        return json.dumps(
            cleaned,
            separators=(",", ":")
        )


class ClothingItemSerializer(serializers.ModelSerializer):
    season = SeasonField()

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