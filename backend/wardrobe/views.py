from .models import ClothingItem
from .serializers import ClothingItemSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import permissions
from rest_framework.parsers import MultiPartParser, FormParser

class ClothingItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]  

    def get(self, request):
        clothing_items = ClothingItem.objects.filter(user=request.user)
        serializer = ClothingItemSerializer(clothing_items, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ClothingItemSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

