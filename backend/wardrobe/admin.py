from django.contrib import admin
from .models import ClothingItem, Outfit

admin.site.register(ClothingItem)

@admin.register(Outfit)
class OutfitAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "name",
        "created_at",
    )

    filter_horizontal = ("items",)