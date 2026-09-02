from django.db import models
from django.conf import settings


class ClothingItem(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    category = models.CharField(
        max_length=20,
        choices=[
            ("top", "Top"),
            ("pants", "Pants"),
            ("shorts", "Shorts"),
            ("outerwear", "Outerwear"),
            ("footwear", "Footwear"),
            ("accessory", "Accessory"),
        ],
    )

    season = models.CharField(
        max_length=100,
    )

    color = models.CharField(max_length=100)

    # Optional accent/secondary color (e.g. red stripes on an otherwise
    # black sneaker). Only set when the item's second color cluster is
    # both a significant share of the item AND visually distinct from
    # the primary color — see AnalyzeClothingView.get_item_colors().
    # Blank means "no meaningful accent color detected".
    secondary_color = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )

    description = models.TextField(blank=True, default="")

    accessory_type = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("watch", "Watch"),
            ("sunglasses", "Sunglasses"),
            ("eyewear", "Eyewear"),
            ("bag", "Bag"),
            ("belt", "Belt"),
            ("hat", "Hat"),
            ("scarf", "Scarf"),
            ("tie", "Tie"),
            ("jewelry", "Jewelry"),
            ("other", "Other"),
        ],
    )

    image = models.ImageField(upload_to="clothing_images/")

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.category} - {self.id}"


class Outfit(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    name = models.CharField(max_length=100)

    items = models.ManyToManyField(ClothingItem, related_name="outfits")

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.id}"
