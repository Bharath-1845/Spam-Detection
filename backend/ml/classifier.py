import os
import re
import pickle
import threading

class EmailClassifier:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(EmailClassifier, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, models_dir=None):
        if self._initialized:
            return
        
        if models_dir is None:
            # Default directory structure v:\mini-project\outputs\models\
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            models_dir = os.path.join(base_dir, "outputs", "models")
            
        self.model_path = os.path.join(models_dir, "naive_bayes_model.pkl")
        self.vectorizer_path = os.path.join(models_dir, "vectorizer.pkl")
        
        self.model = None
        self.vectorizer = None
        self.threshold = 0.5
        self.load_model()
        self._initialized = True

    def load_model(self):
        if not os.path.exists(self.model_path) or not os.path.exists(self.vectorizer_path):
            raise FileNotFoundError(
                f"Model or Vectorizer file not found. Have you run the training script? "
                f"Expected locations:\n- {self.model_path}\n- {self.vectorizer_path}"
            )
            
        with open(self.vectorizer_path, "rb") as f:
            self.vectorizer = pickle.load(f)
            
        with open(self.model_path, "rb") as f:
            model_data = pickle.load(f)
            self.model = model_data["model"]
            self.threshold = model_data["threshold"]

    def clean_text(self, text):
        if not text:
            return ""
        # Case-fold/lowercase
        text = text.lower()
        # Remove punctuation
        text = re.sub(r'[^\w\s]', '', text)
        return text

    def predict(self, text):
        cleaned = self.clean_text(text)
        vectorized = self.vectorizer.transform([cleaned])
        
        # Get probability of spam (class 1)
        # MultinomialNB predict_proba returns [p(ham), p(spam)]
        probs = self.model.predict_proba(vectorized)[0]
        spam_prob = probs[1]
        ham_prob = probs[0]
        
        # Classify based on the tuned threshold
        is_spam = spam_prob >= self.threshold
        
        if is_spam:
            prediction = "spam"
            # Calculate a confidence score for spam.
            # Scale spam_prob from [threshold, 1.0] to [0.5, 1.0] or just return the raw probability.
            # Raw probability is highly standard and intuitive.
            confidence = spam_prob
        else:
            prediction = "ham"
            confidence = ham_prob
            
        return {
            "prediction": prediction,
            "confidence": float(confidence),
            "probabilities": {
                "spam": float(spam_prob),
                "ham": float(ham_prob)
            }
        }
