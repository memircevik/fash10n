from django.urls import path
from .views import ClothingItemView

urlpatterns = [
    path("clothing-items/", ClothingItemView.as_view(), name="clothing-items"),
]
