from django.db import models
from django.conf import settings

class ClothingItem(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    category = models.CharField(max_length=20, choices=[
        ('top', 'Top'), 
        ('bottom', 'Bottom'),
        ('outerwear', 'Outerwear'),
        ('footwear', 'Footwear'),
        ('accessory', 'Accessory'),
    ])
    season = models.CharField(max_length=20, choices=[
        ('spring', 'Spring'),
        ('summer', 'Summer'),
        ('fall', 'Fall'),
        ('winter', 'Winter'),
    ])
    color = models.CharField(max_length=100)
    image = models.ImageField(upload_to='clothing_images/')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
            return f"{self.category} - {self.id}"

class Outfit(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)

    items = models.ManyToManyField(ClothingItem,related_name="outfits")

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
            return f"{self.name} - {self.id}"



    
