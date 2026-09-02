from django.urls import path

from .views import (
    ClothingItemView,
    RemoveBackgroundView,
    OutfitView,
    AnalyzeClothingView,
    TodayOutfitView,
)

urlpatterns = [
    path(
        "clothing-items/",
        ClothingItemView.as_view(),
        name="clothing-items",
    ),

    path(
        "clothing-items/<int:pk>/",
        ClothingItemView.as_view(),
        name="clothing-item-detail",
    ),

    path(
        "remove-background/",
        RemoveBackgroundView.as_view(),
        name="remove-background",
    ),

    path(
        "outfits/",
        OutfitView.as_view(),
        name="outfits",
    ),

    path(
        "analyze-clothing/",
        AnalyzeClothingView.as_view(),
        name="analyze-clothing",
    ),

    path(
        "outfits/<int:pk>/",
        OutfitView.as_view(),
        name="outfit-detail",
    ),

    path(
    "today-outfit/",
    TodayOutfitView.as_view(),
    ),
]