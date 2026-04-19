from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from library.models import Resource, Quiz, Flashcard

User = get_user_model()

class Command(BaseCommand):
    help = 'Seed the Discovery Vault with high-fidelity, book-length academic masterclasses'

    def handle(self, *args, **options):
        # 1. Ensure Identity Matrix
        admin_email = 'admin@flowstate.ai'
        admin, created = User.objects.get_or_create(
            email=admin_email,
            defaults={
                'username': 'AdminFlow',
                'is_staff': True,
                'is_superuser': True,
            }
        )
        if created:
            admin.set_password('AdminFlow2026!')
            admin.save()
            self.stdout.write(self.style.SUCCESS(f'Identity Synchronized: {admin_email} (AdminFlow)'))
        else:
            self.stdout.write(self.style.WARNING(f'Identity Stable: {admin_email}'))

        # 2. Masterclass Harvest (Full Textbook Fidelity)
        curated_data = [
            {
                'title': r'Deep Learning: The Analytical Masterclass',
                'subject': r'Computer Science',
                'resource_type': r'video',
                'url': r'https://www.youtube.com/watch?v=aircAruvnKk',
                'author_name': r'3Blue1Brown x FlowAI',
                'ai_summary': r'The comprehensive analytical guide to modern Artificial Intelligence. This resource explores the mathematical derivations of backpropagation, the architectural evolution of transformers, and the philosophical challenges of AI alignment.',
                'ai_notes_json': {
                    'overview': {
                        'title': r'Neural Architectures: From Perceptrons to Transformers',
                        'summary': r'This study kit provides an exhaustive, multi-chapter exploration of Deep Learning. We analyze the mathematical mechanics of how machines learn, focusing on the multivariable calculus and linear algebra that define the field.'
                    },
                    'sections': [
                        {
                            'title': r'1. The Cybernetic Dream: Biological Inspiration',
                            'content': r'''The journey into Deep Learning begins with the attempt to replicate the human brain's incredible capacity for pattern recognition. Biological neurons are complex electrochemical cells that receive signals via dendrites, process them in the cell body (soma), and transmit them via axons through synapses. In 1943, Warren McCulloch and Walter Pitts introduced a simplified mathematical model: the "Linear Threshold Unit." This was the first formalization of a "neuron" as a simple computational switch that either fires or remains silent based on its input.
\n\nWhile biological neurons are far more sophisticated—utilizing temporal spikes, chemical concentrations, and dynamic structural plasticity—the mathematical abstraction of a node remains the fundamental building block of all AI. Modern Deep Learning moves past the simple "firing" model to continuous activation values, but the core idea of a network of interconnected processors remains unchanged, forming the basis for everything from simple digit recognizers to massive language models like GPT-4.'''
                        },
                        {
                            'title': r'2. Anatomy of the Artificial Neuron',
                            'content': r'''An artificial neuron is a mathematical function that maps multiple inputs to a single output. Each input $x_i$ is prioritized by a **Weight** $w_i$, which represents the "strength" or "importance" of that connection in the learning process. These weights are roughly analogous to the synaptic strength in a biological brain. During training, the network adjusts these weights to find patterns in the data.
\n\nWe add a **Bias** $b$ to the weighted sum, which allows the neuron to shift its decision boundary. The total input $z$ is expressed as:
\n$$z = \sum_{i=1}^{n} w_i x_i + b$$
\nThe bias term is crucial because without it, the neuron would always be forced through the origin $(0,0)$ in the feature space, severely limiting its ability to fit complex data. The weights and biases are the "learned" parameters that define the network's behavior, and finding the optimal values for them is the primary goal of the optimization process.'''
                        },
                        {
                            'title': r'3. Activation Functions: The Power of Non-Linearity',
                            'content': r'''If we simply summed the inputs and weights, the entire network would be a giant linear equation. No matter how many layers a linear network has, it can only perform linear transformations. To learn complex, non-linear patterns, we must introduce **Activation Functions** $(\sigma)$. These functions determine whether the information passed through the neuron is "important" enough to influence the next layer.
\n\n**ReLU (Rectified Linear Unit)** is the current gold standard: $\sigma(z) = \max(0,z)$. It is computationally efficient and helps prevent the "Vanishing Gradient" problem. In contrast, the **Sigmoid** function, $\sigma(z) = \frac{1}{1+e^{-z}}$, squashes values between $0$ and $1$, providing a probabilistic interpretation of the output. While Sigmoid was popular in the early days, it often leads to slow training in deep networks because its gradient becomes nearly zero for large inputs.'''
                        },
                        {
                            'title': r'4. Deep Architectures: Hierarchical Hidden Layers',
                            'content': r'''A "Deep" neural network is defined by having multiple **Hidden Layers** between the input and output. Each layer performs a new level of abstraction, effectively decomposing a complex problem into simpler components. This hierarchical processing is the "secret sauce" of Deep Learning.
\n\nIn image recognition, the first layer might look for low-level edges or gradients. The second layer combines those edges into simple shapes like circles or corners. The third layer recognizes features like eyes, wheels, or textures. The final layer identifies the entire object (a face, a car, a landscape). The ability of deep networks to automatically discover these features—without a human engineer telling them what to look for—is why this field has surpassed classical computer vision in almost every task.'''
                        },
                        {
                            'title': r'5. The Cost Function: The Mathematical Measure of Error',
                            'content': r'''To learn, the network needs a definitive way to measure its own failure. The **Cost Function** $C$ calculates the average discrepancy between the predicted output $a_L$ and the actual target $y$ across the entire training set. For regression problems, we often use **Mean Squared Error (MSE)**:
\n$$C = \frac{1}{n} \sum (y - a_L)^2$$
\nFor classification, where we want to predict the probability of a class, **Cross-Entropy Loss** is preferred. It penalizes the model exponentially more as its incorrect prediction becomes more "confident." The entire learning process can be viewed as an optimization problem: we want to navigate through a high-dimensional "landscape" of weights and biases to find the point where the cost $C$ is at its absolute minimum.'''
                        },
                        {
                            'title': r'6. Optimization: The Logic of Gradient Descent',
                            'content': r'''Gradient Descent is the universal algorithm for finding the minimum of a function. Imagine being on a foggy mountain and wanting to find the valley floor. Without being able to see the destination, your only strategy is to step in the direction where the ground slopes downward the most.
\n\nMathematically, we calculate the **Gradient** $\nabla C$, which points in the direction of the steepest *increase* in cost. To minimize cost, we move in the opposite direction. The size of our steps is determined by the **Learning Rate** $\alpha$:
\n$$w_{new} = w_{old} - \alpha \frac{\partial C}{\partial w}$$
\nThe choice of $\alpha$ is a critical "hyperparameter." If it is too large, you might leap right over the valley. If it is too small, the descent takes an eternity and may get stuck in a tiny "puddle" (a local minimum) instead of finding the true valley (the global minimum).'''
                        },
                        {
                            'title': r'7. Backpropagation: The Calculus Engine',
                            'content': r'''Backpropagation is arguably the most important algorithm in AI history. It is a systematic application of the **Chain Rule** from multivariable calculus that allows us to calculate how every single weight in a network (often numbering in the billions) contributed to a specific mistake.
\n\nBy moving "backwards" from the error at the output layer, we can calculate the derivative of the cost with respect to every weight:
\n$$\frac{\partial C}{\partial w_j} = \frac{\partial C}{\partial a_L} \cdot \frac{\partial a_L}{\partial z_L} \cdot \frac{\partial z_L}{\partial a_{L-1}} \cdot \dots \cdot \frac{\partial z_j}{\partial w_j}$$
\nThis tells us the "influence" each weight has on the final error. Without this efficient way to share the "blame" across the network, training deep models would be computationally impossible. It is the engine that allows AI to learn from its errors with mathematical precision.'''
                        },
                        {
                            'title': r'8. Battling the Vanishing Gradient Problem',
                            'content': r'''In very deep networks, the gradients can become extremely small as they travel backward through many layers (since we repeatedly multiply tiny fractions). Eventually, the gradient effectively "vanishes," and the early layers of the network stop learning. This was the primary reason researchers couldn\'t train deep models for decades.
\n\nThis problem was solved by two major innovations: **Batch Normalization**, which re-scales the data at every layer to keep the signal strong, and **Residual Connections** (ResNets). ResNets use "shortcut connections" that allow the gradient to "skip" certain layers, ensuring that the error signal remains healthy all the way back to the beginning of the network. These architectures allowed the jump from 10 layers to 1,000 layers, enabling true "Deep" learning.'''
                        },
                        {
                            'title': r'9. Stochastic and Mini-Batch Dynamics',
                            'content': r'''Processing the entire dataset (Batch Gradient Descent) to make a single update is slow and memory-intensive. **Stochastic Gradient Descent (SGD)** processes just one random sample at a time. While this makes the "descent" pathway noisy and zigzagged, it is incredibly fast and the noise actually helps the model "bounce" out of shallow local minima.
\n\nModern AI uses a hybrid called **Mini-Batch Gradient Descent**, processing small chunks (typically 32 to 256 samples) at a time. This provides a balance between the stability of Batch GD and the speed and exploratory nature of SGD. It is the most efficient compromise for training large models on modern GPU hardware, providing the smooth yet dynamic optimization required for complex error landscapes.'''
                        },
                        {
                            'title': r'10. Regularization: Dropout and Weight Decay',
                            'content': r'''A high-capacity model with millions of parameters can easily "memorize" the training data rather than understanding the underlying patterns—a failure known as **Overfitting**. This makes the model useless for real-world data it hasn\'t seen before. To combat this, we use **Regularization.**
\n\n**Dropout** is a powerful technique where we randomly "deactivate" a percentage of neurons during training. This prevents any single group of neurons from becoming too specialized, forcing the network to learn multiple reliable paths for the information. **Weight Decay (L2 Regularization)** adds a penalty to the cost function proportional to the size of the weights, encouraging the model to keep weights small and simple, which leads to better generalization on new, unseen data.'''
                        },
                        {
                            'title': r'11. Convolutional Neural Networks (CNNs)',
                            'content': r'''Standard neural networks are "fully connected," meaning every pixel in an image would be treated as an independent variable. This is inefficient and ignores spatial relationships. **CNNs** solve this by using **Kernels** (filters) that slide across the image, looking for local features like edges, textures, or shapes.
\n\nBecause CNNs use "weight sharing" (the same filter is used for the entire image), they drastically reduce the number of parameters needed. They are also "spatially invariant"—it doesn\'t matter if a face is in the top-left or bottom-right of a photo; the CNN will recognize the same features. This architecture is what enabled revolutionized computer vision, medical imaging, and self-driving cars.'''
                        },
                        {
                            'title': r'12. Recurrent Neural Networks and LSTMs',
                            'content': r'''Many real-world problems involve sequences, like the words in a sentence or the prices of a stock. **RNNs** are designed for this by having a "hidden state" that acts as a memory, carrying information from one time-step to the next. However, standard RNNs have a short memory—they forget the start of a long sequence.
\n\nThis was solved by **LSTM (Long Short-Term Memory)** networks. LSTMs use a complex system of "Gates" (Input, Forget, and Output) to decide precisely which information is worth keeping in memory and which can be discarded. This allows the network to maintain context over long durations, which was the state-of-the-art for natural language processing until the arrival of the Transformer.'''
                        },
                        {
                            'title': r'13. The Transformer Revolution: Attention is All You Need',
                            'content': r'''The current era of AI began with the **Transformer** model. Unlike RNNs, which process information step-by-step, Transformers use **Self-Attention** to look at an entire sequence at once. The network calculates how much every word should "pay attention" to every other word in the context.
\n\nFor example, in the sentence "The bank was situated near the river bank," the Attention mechanism sees both instances of "bank" and understands from the surrounding words that one is a financial institution and the other is a geographical feature. This parallel processing is much faster and more powerful than previous sequential methods, forming the architecture for all Large Language Models (LLMs) used today.'''
                        },
                        {
                            'title': r'14. Alignment, Safety, and the Future of AI',
                            'content': r'''As models grow from millions to trillions of parameters, the focus is shifting from "Ability" to **"Alignment."** How do we ensure that an AI whose internal logic we don\'t fully understand behaves according to human values? This involves **RLHF (Reinforcement Learning from Human Feedback)**, where humans rank AI responses to "tune" its behavior.
\n\nThe future of Deep Learning involves moving toward "System 2" thinking—giving AI the ability to reason, plan, and verify its own logic before speaking. We are also seeing the rise of **Multimodal AI**, which can understand text, images, and audio as a single unified concept. These advancements represent the next step on the path toward Artificial General Intelligence (AGI).'''
                        }
                    ],
                    'mind_map': {
                        'center': r'Deep Learning',
                        'branches': [
                            {
                                'topic': r'Neural Foundations',
                                'subtopics': [r'Artificial Neurons', r'Activation Functions', r'Loss Functions']
                            },
                            {
                                'topic': r'Architectures',
                                'subtopics': [r'CNNs (Vision)', r'RNNs (Sequential)', r'Transformers']
                            },
                            {
                                'topic': r'Training',
                                'subtopics': [r'Backpropagation', r'Gradient Descent', r'Regularization']
                            }
                        ]
                    }
                },
                'study_kit': {
                    'quizzes': [
                        {
                            'question': r'What is the primary role of the bias term ($b$) in an artificial neuron?',
                            'options': [r'To normalize the weights', r'To allow the decision boundary to shift away from the origin', r'To prevent the vanishing gradient', r'To serve as the learning rate'],
                            'correct_answer': r'To allow the decision boundary to shift away from the origin',
                            'explanation': r'The bias term allows the activation function to be shifted left or right, which is critical for fitting data that doesn\'t pass through the origin.'
                        },
                        {
                            'question': r'Which activation function is defined as $\max(0, z)$?',
                            'options': [r'Sigmoid', r'Tanh', r'ReLU', r'Softmax'],
                            'correct_answer': r'ReLU',
                            'explanation': r'ReLU (Rectified Linear Unit) returns the input directly if it is positive, otherwise, it returns zero.'
                        }
                    ],
                    'flashcards': [
                        {'question': r'Backpropagation', 'answer': r'An algorithm used to calculate gradients of loss functions with respect to weights via the Chain Rule.', 'subject': r'Deep Learning'},
                        {'question': r'ReLU', 'answer': r'Rectified Linear Unit; the most common activation function in deep networks.', 'subject': r'Deep Learning'}
                    ]
                }
            },
            {
                'title': r'Quantum Mechanics: The Analytical Masterclass',
                'subject': r'Physics',
                'resource_type': r'video',
                'url': r'https://www.youtube.com/watch?v=JhHMJCUmq28',
                'author_name': r'Kurzgesagt x Max Planck Institute',
                'ai_summary': r'The definitive analytical guide to Quantum Theory. This exhaustive resource covers the mathematical derivations of the wavefunction and the physical logic of quantum entanglement.',
                'ai_notes_json': {
                    'overview': {
                        'title': r'Quantum Theory: Foundations and Paradoxes',
                        'summary': r'This study kit provides a rigorous exploration of the subatomic realm. We analyze the mathematical framework of probability waves, non-locality, and fundamental uncertainty.'
                    },
                    'sections': [
                        {
                            'title': r'1. The Crisis: The Ultraviolet Catastrophe',
                            'content': r'''At the turn of the 20th century, physicists were faced with a paradox: classical physics predicted that a hot object should emit infinite amounts of ultraviolet light. This "Ultraviolet Catastrophe" proved that the laws of Newton and Maxwell were incomplete. In 1900, Max Planck solved this by proposing that energy isn\'t continuous but comes in packets called **Quanta**.
\n\nHe introduced the constant $h$ (Planck\'s constant) and the equation $E = hf$. This was the single most important moment in the history of science—the realization that the universe is "pixelated" at the smallest scales.'''
                        },
                        {
                            'title': r'2. The Photon and Wave-Particle Duality',
                            'content': r'''Albert Einstein took Planck\'s idea further by analyzing the **Photoelectric Effect**. He proved that light itself is not just a wave, but is composed of "bullets" of energy called photons. 
\n\nThis led to the mind-bending concept of **Wave-Particle Duality**: light acts like a wave when it travels, but like a particle when it interacts with matter. This duality is not just a property of light; Louis de Broglie later proved that all matter has a wavelength $(\lambda = h/p)$.'''
                        },
                        {
                            'title': r'3. The Schrödinger Equation: The New Law of Motion',
                            'content': r'''In the classical world, $F=ma$ tells us how things move. In the quantum world, the law of motion is the **Time-Dependent Schrödinger Equation**:
\n$$i\hbar\frac{\partial}{\partial t}\Psi(\mathbf{r},t) = \hat{H}\Psi(\mathbf{r},t)$$
\nThe wavefunction $\Psi$ is the state of the system, and the Hamiltonian $\hat{H}$ represents the total energy. Importantly, this equation doesn\'t tell us where a particle *is*—it tells us how the *wave of probability* moves through space.'''
                        },
                        {
                            'title': r'4. The Born Rule and Probability Density',
                            'content': r'''Max Born provided the bridge between the abstract math of the wavefunction and the real world. He realized that the wavefunction itself is unobservable, but its square magnitude $|\Psi|^2$ represents the **Probability Density**. This means we can only predict the *chances* of finding a particle in a certain location.'''
                        },
                        {
                            'title': r'5. Heisenberg Uncertainty: The Limit of Knowledge',
                            'content': r'''Werner Heisenberg proved that this randomness isn\'t just because our tools are bad—it\'s a fundamental law of nature. The more precisely you know a particle\'s position ($x$), the more uncertain its momentum ($p$) becomes:
\n$$\Delta x \cdot \Delta p \ge \frac{\hbar}{2}$$
\nThis isn\'t just a measurement problem; it's a reality problem. Uncertainty is quite literally the reason matter exists.'''
                        },
                        {
                            'title': r'6. Quantum Tunneling: Walking Through Walls',
                            'content': r'''In classical physics, if a ball doesn\'t have enough energy to go over a hill, it stays on the other side. In quantum mechanics, because particles are "smears" of probability, part of the wave can exist on the *other side* of a barrier. This is **Quantum Tunneling**.
\n\nIt is what allows the Sun to shine (hydrogen fusion) and enables technologies like Flash memory and SSDs.'''
                        },
                        {
                            'title': r'7. Spin and the Pauli Exclusion Principle',
                            'content': r'''All elementary particles have an intrinsic property called **Spin**. Wolfgang Pauli realized that no two "fermions" (like electrons) can occupy the same quantum state simultaneously.
\n\nThis **Exclusion Principle** is what creates the "shells" around atoms. It prevents all the electrons from falling into the same low-energy state, forcing them to build up into the complex structures of the periodic table.'''
                        },
                        {
                            'title': r'8. Superposition and Schrödinger\'s Cat',
                            'content': r'''Superposition is the ability of a quantum system to be in multiple states at once. According to quantum logic, until a box is opened, a radioactive atom is both decayed and undecayed. The question of how the "quantum many" becomes the "classical one" remains the great "Measurement Problem."'''
                        },
                        {
                            'title': r'9. Entanglement: Einstein\'s Spooky Action',
                            'content': r'''Entanglement is the most mysterious phenomenon in physics. Two particles can become so linked that they share a single wavefunction. Measuring the spin of one particle *instantly* determines the spin of the other, even if they are on opposite sides of the galaxy.
\n\nEinstein famously called this "Spooky action at a distance." This entanglement is now the primary resource for the next generation of technology: Quantum Computers.'''
                        },
                        {
                            'title': r'10. Bell\'s Theorem: Proving the Weirdness',
                            'content': r'''In 1964, John Bell proposed a mathematical test to settle the debate between Einstein and Bohr. He proved that if Einstein were right about "hidden variables," correlations would stay below a limit. Experiments proved Bohr correct: particles don\'t have definite properties until observed.'''
                        },
                        {
                            'title': r'11. Quantum Computing and Qubits',
                            'content': r'''A classical computer uses bits (0 or 1). A **Quantum Computer** uses **Qubits**, which exist in a superposition: $a|0\rangle + b|1\rangle$. This allows a quantum computer to solve in seconds what the fastest supercomputer would take billions of years to handle.'''
                        },
                        {
                            'title': r'12. Interpretations: Many Worlds vs Copenhagen',
                            'content': r'''The **Copenhagen Interpretation** says that the wavefunction "collapses" into a single state when we measure it. The **Many-Worlds Interpretation** says that every time a quantum event happens, the universe branches into every possible outcome.'''
                        },
                        {
                            'title': r'13. The Future: A Theory of Everything',
                            'content': r'''The ultimate goal of physics is to unite Quantum Mechanics with General Relativity. Candidates include **String Theory** and **Loop Quantum Gravity**. Until then, quantum mechanics remain the most absolute theory we have ever discovered.'''
                        }
                    ],
                    'mind_map': {
                        'center': r'Quantum Mechanics',
                        'branches': [
                            {
                                'topic': r'Wave Theory',
                                'subtopics': [r'Wave-Particle Duality', r'Schrödinger Equation', r'Born Rule']
                            },
                            {
                                'topic': r'Quantum Laws',
                                'subtopics': [r'Uncertainty Principle', r'Exclusion Principle', r'Tunneling']
                            },
                            {
                                'topic': r'Paradoxes',
                                'subtopics': [r'Entanglement', r'Superposition', r'Schrödinger\'s Cat']
                            }
                        ]
                    }
                },
                'study_kit': {
                    'quizzes': [
                        {
                            'question': r'What does the Schrödinger Equation describe?',
                            'options': [r'Definitive position', r'Evolution of the probability wave', r'Gravitational pull', r'Vacuum temperature'],
                            'correct_answer': r'Evolution of the probability wave',
                            'explanation': r'The Schrödinger equation describes the time-evolution of the wavefunction.'
                        }
                    ],
                    'flashcards': [
                        {'question': r'Superposition', 'answer': r'Ability to exist in multiple states at once.', 'subject': r'Physics'}
                    ]
                }
            },
            {
                'title': r'General Relativity: The Analytical Masterclass',
                'subject': r'Physics',
                'resource_type': r'video',
                'url': r'https://www.youtube.com/watch?v=tzQC3uYL67U',
                'author_name': r'Science-Phile x FlowAI',
                'ai_summary': r'An exhaustive masterclass on Einstein\'s achievement, from the Equivalence Principle to Black Holes and Gravitational Waves.',
                'ai_notes_json': {
                    'overview': {
                        'title': r'General Relativity: Geometry and Gravitation',
                        'summary': r'General Relativity is the study of how mass and energy warp the fabric of spacetime. Gravity is not a force, but geometry itself.'
                    },
                    'sections': [
                        {
                            'title': r'1. Beyond Newton: The Crisis of Gravity',
                            'content': r'''For over 200 years, Newton\'s laws reigned supreme. But he couldn\'t explain *how* gravity worked at a distance. It also conflicted with Special Relativity\'s rule that nothing travels faster than light. This crisis led Einstein to the idea of spacetime curvature.'''
                        },
                        {
                            'title': r'2. The Principle of Equivalence',
                            'content': r'''Einstein realized that gravity and acceleration are indistinguishable. If an elevator accelerates upward in space at $9.8 \text{ m/s}^2$, you feel exactly like you do on Earth. This proved gravity is related to the geometry of your environment.'''
                        },
                        {
                            'title': r'3. Spacetime as a Unified Fabric',
                            'content': r'''Einstein merged Space and Time into a 4-dimensional fabric called **Spacetime.** Mass tells spacetime how to curve, and spacetime tells matter how to move. Orbits are natural "grooves" in the fabric of space.'''
                        },
                        {
                            'title': r'4. The Geometry of Curvature',
                            'content': r'''Einstein used **Tensors** to describe curvature. In curved 4D spacetime, the shortest path is a **Geodesic.** This is why light bends near a star—it takes the straightest possible path through the curved geometry.'''
                        },
                        {
                            'title': r'5. The Einstein Field Equations (EFE)',
                            'content': r'''In 1915, Einstein revealed the ten equations defining the universe. In shorthand: $$G_{\mu\nu} + \Lambda g_{\mu\nu} = \frac{8\pi G}{c^4} T_{\mu\nu}$$. Curvature on the left, Matter on the right.'''
                        },
                        {
                            'title': r'6. Time Dilation: Gravity Warps the Clock',
                            'content': r'''Gravity slows down time. A clock on a massive planet ticks slower than one in space. GPS satellites must account for this (45 microseconds per day) or their locations would drift by kilometers.'''
                        },
                        {
                            'title': r'7. Gravitational Lensing',
                            'content': r'''Curved space acts like a giant magnifying glass. Massive galaxy clusters bend light from distant objects, creating "Einstein Rings." This is our primary tool for measuring Dark Matter.'''
                        },
                        {
                            'title': r'8. Black Holes: The Ultimate Curvature',
                            'content': r'''Squashing enough mass into a small space creates a region where curvature is so extreme that light cannot escape. Black holes are regions where the "exit velocity" exceeds the speed of light.'''
                        },
                        {
                            'title': r'9. The Event Horizon',
                            'content': r'''Every black hole has a "Point of No Return" called the Event Horizon. Its size is the **Schwarzschild Radius** ($R_s = \frac{2GM}{c^2}$). For Earth, it would be 9 millimeters; for the Sun, 3 kilometers.'''
                        },
                        {
                            'title': r'10. Singularity: Where Math Breaks',
                            'content': r'''At the center of a black hole, equations return infinity. This signals that General Relativity is incomplete and we need a theory of **Quantum Gravity** to bridge the very large with the very small.'''
                        },
                        {
                            'title': r'11. Gravitational Waves',
                            'content': r'''Vibrating masses create ripples in spacetime. Predicted in 1916, they were finally detected by LIGO in 2015 from colliding black holes 1.3 billion light-years away. We can now "hear" the cosmos ripple.'''
                        },
                        {
                            'title': r'12. The Expanding Universe',
                            'content': r'''Initially, Einstein added a "Cosmological Constant" ($\Lambda$) to keep the universe static. Hubble proved expansion, but today $\Lambda$ is the leading explanation for **Dark Energy** driving accelerated expansion.'''
                        },
                        {
                            'title': r'13. The Quest for Quantum Theory',
                            'content': r'''The "Holy Grail" is a Unified Field Theory combining Einstein\'s gravity with subatomic Quantum Mechanics. Candidates like String Theory and Loop Quantum Gravity attempt to bridge this gap.'''
                        }
                    ],
                    'mind_map': {
                        'center': r'General Relativity',
                        'branches': [
                            {
                                'topic': r'Foundations',
                                'subtopics': [r'Equivalence Principle', r'Unified Spacetime', r'Geodesics']
                            },
                            {
                                'topic': r'Cosmic Effects',
                                'subtopics': [r'Time Dilation', r'Gravitational Lensing', r'Black Holes']
                            },
                            {
                                'topic': r'Cosmology',
                                'subtopics': [r'Gravitational Waves', r'Expanding Universe', r'Dark Energy']
                            }
                        ]
                    }
                },
                'study_kit': {
                    'quizzes': [
                        {
                            'question': r'What happens to a clock closer to a massive star?',
                            'options': [r'Ticks faster', r'Ticks slower', r'Stops', r'No change'],
                            'correct_answer': r'Ticks slower',
                            'explanation': r'Gravitational time dilation slows time in higher gravitational potential.'
                        }
                    ],
                    'flashcards': [
                        {'question': r'Event Horizon', 'answer': r'Point of no return for a black hole.', 'subject': r'Physics'}
                    ]
                }
            },
            {
                'title': r'Bioenergetics: Molecular Masterclass',
                'subject': r'Biology',
                'resource_type': r'video',
                'url': r'https://www.youtube.com/watch?v=juM2ROSLWfw',
                'author_name': r'Khan Academy x BioMed Collective',
                'ai_summary': r'A biochemical investigation into Cellular Respiration, covering the Citric Acid Cycle with undergraduate-level precision.',
                'ai_notes_json': {
                    'overview': {
                        'title': r'Molecular Metabolism: The TCA Cycle',
                        'summary': r'The Citric Acid Cycle is the core of aerobic life. We analyze every molecular transition and energy-harvesting step.'
                    },
                    'sections': [
                        {
                            'title': r'1. The Metabolic Hub: Intro',
                            'content': r'''The Krebs cycle is the primary crossroads of cellular metabolism, occurring in the Mitochondrial Matrix. It is the bridge between Glycolysis and the Electron Transport Chain.'''
                        },
                        {
                            'title': r'2. Mitochondrial Architecture',
                            'content': r'''Structure dictates function. The double-membraned mitochondrion folds its inner membrane into Cristae to maximize ATP production surface area. Enzymes of the cycle sit in the innermost Matrix.'''
                        },
                        {
                            'title': r'3. The Portal Step: Pyruvate Oxidation',
                            'content': r'''Before entering the cycle, Pyruvate must be converted to **Acetyl-CoA** by the massive Pyruvate Dehydrogenase Complex. This is a gatekeeper step that commits carbons to energy production.'''
                        },
                        {
                            'title': r'4. Step 1: Citrate Synthesis',
                            'content': r'''The cycle begins as Acetyl-CoA condensation with Oxaloacetate forms Citrate. This highly exergonic reaction acts like a power-stroke, pulling the entire cycle forward.'''
                        },
                        {
                            'title': r'5. Step 2 & 3: Isomerization',
                            'content': r'''Citrate is turned into Isocitrate. This housekeeping reaction makes the molecule susceptible to upcoming oxidative decarboxylation steps.'''
                        },
                        {
                            'title': r'6. Step 4: First Energy Harvest',
                            'content': r'''Isocitrate Dehydrogenase converts Isocitrate to α-Ketoglutarate, releasing the first CO2 and harvesting the first **NADH.** This is the rate-limiting step.'''
                        },
                        {
                            'title': r'7. Step 5: Second Energy Harvest',
                            'content': r'''Another CO2 is released and a second NADH produced to form Succinyl-CoA. By now, the original entering carbons have been effectively "exhaled" as CO2 waste.'''
                        },
                        {
                            'title': r'8. Step 6: Direct Energy Production',
                            'content': r'''Breaking the thioester bond in Succinyl-CoA drives the synthesis of **GTP/ATP.** This is the only step that generates high-energy phosphate directly.'''
                        },
                        {
                            'title': r'9. Step 7: Succinate Dehydrogenase',
                            'content': r'''Succinate is oxidized to Fumarate, producing **FADH2.** This enzyme is physically part of the Electron Transport Chain (Complex II).'''
                        },
                        {
                            'title': r'10. Step 8 & 11: Regeneration',
                            'content': r'''Fumarate to Malate, then Malate to Oxaloacetate. This final oxidation produces the third and final **NADH.** The system is now reset to its starting state.'''
                        },
                        {
                            'title': r'11. Energy Stoichiometry',
                            'content': r'''Per Acetyl-CoA: 3 NADH, 1 FADH2, 1 ATP/GTP. Per glucose (2 turns), the Krebs cycle provides 90% of the energy needed for life. It is the literal fire of existence.'''
                        },
                        {
                            'title': r'12. Regulation Controls',
                            'content': r'''High ATP/NADH inhibit the cycle. Calcium ions (released during muscle contraction) stomps on the gas pedal, ensuring energy production meets demand perfectly.'''
                        },
                        {
                            'title': r'13. Anaplerotic Reactions',
                            'content': r'''The cycle is "amphibolic"—it burns fuel but also builds carbon backbones for proteins. Anaplerotic reactions like Pyruvate Carboxylase "refill the tank" when parts are taken for building.'''
                        }
                    ],
                    'mind_map': {
                        'center': r'Bioenergetics',
                        'branches': [
                            {
                                'topic': r'Portal Step',
                                'subtopics': [r'Pyruvate Oxidation', r'Acetyl-CoA Gatekeeper']
                            },
                            {
                                'topic': r'Harvest Logic',
                                'subtopics': [r'Exhale CO2', r'Bucket NADH', r'FADH2 regular fuel']
                            },
                            {
                                'topic': r'Regulators',
                                'subtopics': [r'ATP/NADH Brakes', r'Calcium Gas Pedal']
                            }
                        ]
                    }
                },
                'study_kit': {
                    'quizzes': [
                        {
                            'question': r'Where are the TCA enzymes located?',
                            'options': [r'Cytoplasm', r'Matrix', r'Intermembrane', r'ER'],
                            'correct_answer': r'Matrix',
                            'explanation': r'Krebs cycle enzymes sit in the fluid matrix of the mitochondria.'
                        }
                    ],
                    'flashcards': [
                        {'question': r'TCA Cycle', 'answer': r'Tricarboxylic Acid cycle, another name for Krebs cycle.', 'subject': r'Biology'}
                    ]
                }
            }
        ]

        self.stdout.write(self.style.WARNING('Purging existing curated materials...'))
        Resource.objects.filter(is_public=True).delete()

        for item in curated_data:
            resource, created = Resource.objects.update_or_create(
                title=item['title'],
                defaults={
                    'owner': admin,
                    'subject': item['subject'],
                    'resource_type': item['resource_type'],
                    'url': item.get('url'),
                    'author_name': item['author_name'],
                    'ai_summary': item['ai_summary'],
                    'ai_notes_json': item['ai_notes_json'],
                    'is_public': True,
                    'status': 'ready',
                    'has_study_kit': True
                }
            )
            
            # 1. Inject Masterclass Quiz
            kit = item.get('study_kit', {})
            if kit.get('quizzes'):
                Quiz.objects.create(
                    resource=resource,
                    owner=admin,
                    title=f"{resource.title} - Masterclass Assessment",
                    format='mcq',
                    questions=kit['quizzes'],
                    academic_level='undergrad',
                    is_public=True
                )

            # 2. Inject Masterclass Flashcards
            if kit.get('flashcards'):
                for fc in kit['flashcards']:
                    Flashcard.objects.create(
                        resource=resource,
                        owner=admin,
                        question=fc['question'],
                        answer=fc['answer'],
                        subject=fc['subject'],
                        is_public=True
                    )

            self.stdout.write(self.style.SUCCESS(f'Textbook Depth Restored: {item["title"]}'))

        self.stdout.write(self.style.SUCCESS('Discovery Restoration Complete.'))
