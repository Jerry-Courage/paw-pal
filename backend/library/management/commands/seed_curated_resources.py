from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from library.models import Resource

User = get_user_model()

class Command(BaseCommand):
    help = 'Seed the library with definitive, textbook-length academic resources'

    def handle(self, *args, **options):
        owner = User.objects.filter(is_superuser=True).first()
        if not owner:
            self.stdout.write(self.style.ERROR('No superuser found.'))
            return

        curated_data = [
            {
                'title': r'Deep Learning: The Analytical Masterclass',
                'subject': r'Computer Science',
                'resource_type': r'video',
                'url': r'https://www.youtube.com/watch?v=aircAruvnKk',
                'author_name': r'3Blue1Brown x FlowAI',
                'ai_summary': r'The comprehensive analytical guide to modern Artificial Intelligence. This resource provides thousands of words of technical depth, exploring the mathematical derivations of backpropagation, the architectural evolution of transformers, and the philosophical challenges of AI alignment.',
                'ai_notes_json': {
                    'overview': {
                        'title': r'Neural Architectures: From Perceptrons to Transformers',
                        'summary': r'This study kit provides an exhaustive, multi-chapter exploration of Deep Learning. We analyze the mathematical mechanics of how machines learn, focusing on the multivariable calculus and linear algebra that define the field.'
                    },
                    'sections': [
                        {
                            'title': r'1. The Cybernetic Dream: Biological Inspiration',
                            'content': r'''The journey into Deep Learning begins with the attempt to replicate the human brain's incredible capacity for pattern recognition. Biological neurons are complex electrochemical cells that receive signals via dendrites, process them in the cell body (soma), and transmit them via axons through synapses. In 1943, Warren McCulloch and Walter Pitts introduced a simplified mathematical model: the "Linear Threshold Unit." This was the first formalization of a "neuron" as a simple computational switch that either fires or remains silent based on its input.

While biological neurons are far more sophisticated—utilizing temporal spikes, chemical concentrations, and dynamic structural plasticity—the mathematical abstraction of a node remains the fundamental building block of all AI. Modern Deep Learning moves past the simple "firing" model to continuous activation values, but the core idea of a network of interconnected processors remains unchanged, forming the basis for everything from simple digit recognizers to massive language models like GPT-4.'''
                        },
                        {
                            'title': r'2. Anatomy of the Artificial Neuron',
                            'content': r'''An artificial neuron is a mathematical function that maps multiple inputs to a single output. Each input $x_i$ is prioritized by a **Weight** $w_i$, which represents the "strength" or "importance" of that connection in the learning process. These weights are roughly analogous to the synaptic strength in a biological brain. During training, the network adjusts these weights to find patterns in the data.

We add a **Bias** $b$ to the weighted sum, which allows the neuron to shift its decision boundary. The total input $z$ is expressed as:
$$z = \sum_{i=1}^{n} w_i x_i + b$$
The bias term is crucial because without it, the neuron would always be forced through the origin $(0,0)$ in the feature space, severely limiting its ability to fit complex data. The weights and biases are the "learned" parameters that define the network's behavior, and finding the optimal values for them is the primary goal of the optimization process.'''
                        },
                        {
                            'title': r'3. Activation Functions: The Power of Non-Linearity',
                            'content': r'''If we simply summed the inputs and weights, the entire network would be a giant linear equation. No matter how many layers a linear network has, it can only perform linear transformations. To learn complex, non-linear patterns (like the difference between a picture of a cat and a dog), we must introduce **Activation Functions** $(\sigma)$. These functions determine whether the information passed through the neuron is "important" enough to influence the next layer.

**ReLU (Rectified Linear Unit)** is the current gold standard: $\sigma(z) = \max(0,z)$. It is computationally efficient and helps prevent the "Vanishing Gradient" problem. In contrast, the **Sigmoid** function, $\sigma(z) = \frac{1}{1+e^{-z}}$, squashes values between $0$ and $1$, providing a probabilistic interpretation of the output. While Sigmoid was popular in the early days, it often leads to slow training in deep networks because its gradient becomes nearly zero for large inputs.'''
                        },
                        {
                            'title': r'4. Deep Architectures: Hierarchical Hidden Layers',
                            'content': r'''A "Deep" neural network is defined by having multiple **Hidden Layers** between the input and output. Each layer performs a new level of abstraction, effectively decomposing a complex problem into simpler components. This hierarchical processing is the "secret sauce" of Deep Learning.

In image recognition, the first layer might look for low-level edges or gradients. The second layer combines those edges into simple shapes like circles or corners. The third layer recognizes features like eyes, wheels, or textures. The final layer identifies the entire object (a face, a car, a landscape). The ability of deep networks to automatically discover these features—without a human engineer telling them what to look for—is why this field has surpassed classical computer vision in almost every task.'''
                        },
                        {
                            'title': r'5. The Cost Function: The Mathematical Measure of Error',
                            'content': r'''To learn, the network needs a definitive way to measure its own failure. The **Cost Function** $C$ calculates the average discrepancy between the predicted output $a_L$ and the actual target $y$ across the entire training set. For regression problems, we often use **Mean Squared Error (MSE)**:
$$C = \frac{1}{n} \sum (y - a_L)^2$$
For classification, where we want to predict the probability of a class, **Cross-Entropy Loss** is preferred. It penalizes the model exponentially more as its incorrect prediction becomes more "confident." The entire learning process can be viewed as an optimization problem: we want to navigate through a high-dimensional "landscape" of weights and biases to find the point where the cost $C$ is at its absolute minimum.'''
                        },
                        {
                            'title': r'6. Optimization: The Logic of Gradient Descent',
                            'content': r'''Gradient Descent is the universal algorithm for finding the minimum of a function. Imagine being on a foggy mountain and wanting to find the valley floor. Without being able to see the destination, your only strategy is to step in the direction where the ground slopes downward the most.

Mathematically, we calculate the **Gradient** $\nabla C$, which points in the direction of the steepest *increase* in cost. To minimize cost, we move in the opposite direction. The size of our steps is determined by the **Learning Rate** $\alpha$:
$$w_{new} = w_{old} - \alpha \frac{\partial C}{\partial w}$$
The choice of $\alpha$ is a critical "hyperparameter." If it is too large, you might leap right over the valley. If it is too small, the descent takes an eternity and may get stuck in a tiny "puddle" (a local minimum) instead of finding the true valley (the global minimum).'''
                        },
                        {
                            'title': r'7. Backpropagation: The Calculus Engine',
                            'content': r'''Backpropagation is arguably the most important algorithm in AI history. It is a systematic application of the **Chain Rule** from multivariable calculus that allows us to calculate how every single weight in a network (often numbering in the billions) contributed to a specific mistake.

By moving "backwards" from the error at the output layer, we can calculate the derivative of the cost with respect to every weight:
$$\frac{\partial C}{\partial w_j} = \frac{\partial C}{\partial a_L} \cdot \frac{\partial a_L}{\partial z_L} \cdot \frac{\partial z_L}{\partial a_{L-1}} \cdot \dots \cdot \frac{\partial z_j}{\partial w_j}$$
This tells us the "influence" each weight has on the final error. Without this efficient way to share the "blame" across the network, training deep models would be computationally impossible. It is the engine that allows AI to learn from its errors with mathematical precision.'''
                        },
                        {
                            'title': r'8. Battling the Vanishing Gradient Problem',
                            'content': r'''In very deep networks, the gradients can become extremely small as they travel backward through many layers (since we repeatedly multiply tiny fractions). Eventually, the gradient effectively "vanishes," and the early layers of the network stop learning. This was the primary reason researchers couldn\'t train deep models for decades.

This problem was solved by two major innovations: **Batch Normalization**, which re-scales the data at every layer to keep the signal strong, and **Residual Connections** (ResNets). ResNets use "shortcut connections" that allow the gradient to "skip" certain layers, ensuring that the error signal remains healthy all the way back to the beginning of the network. These architectures allowed the jump from 10 layers to 1,000 layers, enabling true "Deep" learning.'''
                        },
                        {
                            'title': r'9. Stochastic and Mini-Batch Dynamics',
                            'content': r'''Processing the entire dataset (Batch Gradient Descent) to make a single update is slow and memory-intensive. **Stochastic Gradient Descent (SGD)** processes just one random sample at a time. While this makes the "descent" pathway noisy and zigzagged, it is incredibly fast and the noise actually helps the model "bounce" out of shallow local minima.

Modern AI uses a hybrid called **Mini-Batch Gradient Descent**, processing small chunks (typically 32 to 256 samples) at a time. This provides a balance between the stability of Batch GD and the speed and exploratory nature of SGD. It is the most efficient compromise for training large models on modern GPU hardware, providing the smooth yet dynamic optimization required for complex error landscapes.'''
                        },
                        {
                            'title': r'10. Regularization: Dropout and Weight Decay',
                            'content': r'''A high-capacity model with millions of parameters can easily "memorize" the training data rather than understanding the underlying patterns—a failure known as **Overfitting**. This makes the model useless for real-world data it hasn\'t seen before. To combat this, we use **Regularization**.

**Dropout** is a powerful technique where we randomly "deactivate" a percentage of neurons during training. This prevents any single group of neurons from becoming too specialized, forcing the network to learn multiple reliable paths for the information. **Weight Decay (L2 Regularization)** adds a penalty to the cost function proportional to the size of the weights, encouraging the model to keep weights small and simple, which leads to better generalization on new, unseen data.'''
                        },
                        {
                            'title': r'11. Convolutional Neural Networks (CNNs)',
                            'content': r'''Standard neural networks are "fully connected," meaning every pixel in an image would be treated as an independent variable. This is inefficient and ignores spatial relationships. **CNNs** solve this by using **Kernels** (filters) that slide across the image, looking for local features like edges, textures, or shapes.

Because CNNs use "weight sharing" (the same filter is used for the entire image), they drastically reduce the number of parameters needed. They are also "spatially invariant"—it doesn\'t matter if a face is in the top-left or bottom-right of a photo; the CNN will recognize the same features. This architecture is what enabled revolutionized computer vision, medical imaging, and self-driving cars.'''
                        },
                        {
                            'title': r'12. Recurrent Neural Networks and LSTMs',
                            'content': r'''Many real-world problems involve sequences, like the words in a sentence or the prices of a stock. **RNNs** are designed for this by having a "hidden state" that acts as a memory, carrying information from one time-step to the next. However, standard RNNs have a short memory—they forget the start of a long sequence.

This was solved by **LSTM (Long Short-Term Memory)** networks. LSTMs use a complex system of "Gates" (Input, Forget, and Output) to decide precisely which information is worth keeping in memory and which can be discarded. This allows the network to maintain context over long durations, which was the state-of-the-art for natural language processing until the arrival of the Transformer.'''
                        },
                        {
                            'title': r'13. The Transformer Revolution: Attention is All You Need',
                            'content': r'''The current era of AI began with the **Transformer** model. Unlike RNNs, which process information step-by-step, Transformers use **Self-Attention** to look at an entire sequence at once. The network calculates how much every word should "pay attention" to every other word in the context.

For example, in the sentence "The bank was situated near the river bank," the Attention mechanism sees both instances of "bank" and understands from the surrounding words that one is a financial institution and the other is a geographical feature. This parallel processing is much faster and more powerful than previous sequential methods, forming the architecture for all Large Language Models (LLMs) used today.'''
                        },
                        {
                            'title': r'14. Alignment, Safety, and the Future of AI',
                            'content': r'''As models grow from millions to trillions of parameters, the focus is shifting from "Ability" to **"Alignment."** How do we ensure that an AI whose internal logic we don\'t fully understand behaves according to human values? This involves **RLHF (Reinforcement Learning from Human Feedback)**, where humans rank AI responses to "tune" its behavior.

The future of Deep Learning involves moving toward "System 2" thinking—giving AI the ability to reason, plan, and verify its own logic before speaking. We are also seeing the rise of **Multimodal AI**, which can understand text, images, and audio as a single unified concept. These advancements represent the next step on the path toward Artificial General Intelligence (AGI).'''
                        }
                    ]
                },
                'ai_concepts': [{'title': r'Backpropagation', 'explanation': r'The multivariable calculus engine that allows networks to learn from their errors.'}]
            },
            {
                'title': r'Quantum Mechanics: The Analytical Deep-Dive',
                'subject': r'Physics',
                'resource_type': r'video',
                'url': r'https://www.youtube.com/watch?v=JhHMJCUmq28',
                'author_name': r'Kurzgesagt x Max Planck Institute',
                'ai_summary': r'The definitive analytical guide to Quantum Theory. This exhaustive resource covers the mathematical derivations of the wavefunction, the historical Bohr-Einstein debates, and the physical logic of quantum entanglement and computing.',
                'ai_notes_json': {
                    'overview': {
                        'title': r'Quantum Theory: Foundations and Paradoxes',
                        'summary': r'This study kit provides a rigorous exploration of the subatomic realm. We analyze the mathematical framework of probability waves, non-locality, and the fundamental uncertainty that defines our universe.'
                    },
                    'sections': [
                        {
                            'title': r'1. The Crisis: The Ultraviolet Catastrophe',
                            'content': r'''At the turn of the 20th century, physicists were faced with a paradox: classical physics predicted that a hot object should emit infinite amounts of ultraviolet light. This "Ultraviolet Catastrophe" proved that the laws of Newton and Maxwell were incomplete. In 1900, Max Planck solved this by proposing that energy isn\'t continuous but comes in discrete packets called **Quanta**.

He introduced the constant $h$ (Planck\'s constant) and the equation $E = hf$. This was the single most important moment in the history of science—the realization that the universe is "pixelated" at the smallest scales. Planck himself initially thought this was just a mathematical trick, but it would eventually lead to a complete overhaul of our understanding of reality.'''
                        },
                        {
                            'title': r'2. The Photon and Wave-Particle Duality',
                            'content': r'''Albert Einstein took Planck\'s idea further by analyzing the **Photoelectric Effect**. He proved that light itself is not just a wave, but is composed of "bullets" of energy called photons. Even if you shine a very bright light on a metal, no electrons are ejected unless the light has a certain *frequency* (wavelength).

This led to the mind-bending concept of **Wave-Particle Duality**: light acts like a wave when it travels, but like a particle when it interacts with matter. This duality is not just a property of light; Louis de Broglie later proved that all matter—including electrons and even you—has a wavelength $(\lambda = h/p)$. While we are too big to see our own waves, this effect is critical for the stability of atoms.'''
                        },
                        {
                            'title': r'3. The Schrödinger Equation: The New Law of Motion',
                            'content': r'''In the classical world, $F=ma$ tells us how things move. In the quantum world, the law of motion is the **Time-Dependent Schrödinger Equation**:
$$i\hbar\frac{\partial}{\partial t}\Psi(\mathbf{r},t) = \hat{H}\Psi(\mathbf{r},t)$$
The wavefunction $\Psi$ is the state of the system, and the Hamiltonian $\hat{H}$ represents the total energy. Importantly, this equation doesn\'t tell us where a particle *is*—it tells us how the *wave of probability* moves through space. The particle doesn\'t even have a definite position until we look at it; it exists in a state of "potential" until the moment of measurement.'''
                        },
                        {
                            'title': r'4. The Born Rule and Probability Density',
                            'content': r'''Max Born provided the bridge between the abstract math of the wavefunction and the real world. He realized that the wavefunction itself is unobservable, but its square magnitude $|\Psi|^2$ represents the **Probability Density**. This means we can only predict the *chances* of finding a particle in a certain location.

This was a radical departure from the deterministic universe of Newton, where if you know the position and speed of everything, you can predict the future with 100% accuracy. Quantum mechanics says that even if you have perfect information, you can only predict probabilities. This fundamental randomness is one of the hardest things for humans to wrap their minds around.'''
                        },
                        {
                            'title': r'5. Heisenberg Uncertainty: The Limit of Knowledge',
                            'content': r'''Werner Heisenberg proved that this randomness isn\'t just because our tools are bad—it\'s a fundamental law of nature. The more precisely you know a particle\'s position ($x$), the more uncertain its momentum ($p$) becomes:
$$\Delta x \cdot \Delta p \ge \frac{\hbar}{2}$$
This isn\'t just a measurement problem; it\'s a reality problem. If an electron were perfectly still, its uncertainty in position would be infinite. This principle is why atoms are stable; if the electron got too close to the nucleus, its momentum would become so uncertain and large that it would fly away. Uncertainty is quite literally the reason matter exists.'''
                        },
                        {
                            'title': r'6. Quantum Tunneling: Walking Through Walls',
                            'content': r'''In classical physics, if a ball doesn\'t have enough energy to go over a hill, it stays on the other side. In quantum mechanics, because particles are "smears" of probability, part of the wave can exist on the *other side* of a barrier. This is **Quantum Tunneling**.

It sounds like science fiction, but it is a fundamental fact of life. The Sun only shines because hydrogen atoms "tunnel" through their energy barriers to fuse. Without tunneling, there would be no stars and no life. It is also the technology behind Flash memory and SSDs in your computer, which move electrons "through" insulating layers that should be impenetrable.'''
                        },
                        {
                            'title': r'7. Spin and the Pauli Exclusion Principle',
                            'content': r'''All elementary particles have an intrinsic property called **Spin**. It is a quantized form of angular momentum, but the particle isn\'t actually rotating. Electrons have spin $1/2$. Wolfgang Pauli realized that no two "fermions" (particles with half-integer spin) can occupy the same quantum state simultaneously.

This **Exclusion Principle** is what creates the "shells" around atoms. It prevents all the electrons from falling into the same low-energy state, forcing them to build up into the complex structures of the periodic table. If electrons didn\'t obey this rule, all matter would collapse into a tiny, dense point. Spin and exclusion are the architects of the material world.'''
                        },
                        {
                            'title': r'8. Superposition and Schrödinger\'s Cat',
                            'content': r'''Superposition is the ability of a quantum system to be in multiple states at once. To illustrate how strange this is, Erwin Schrödinger proposed a thought experiment: a cat in a box with a radioactive atom and a vial of poison. If the atom decays, the cat dies.

According to quantum logic, until the box is opened, the atom is both decayed and undecayed, meaning the cat is both alive and dead. He meant this as a criticism to show that quantum mechanics shouldn\'t apply to big objects, but it has become the most famous symbol of the "Schrödinger's Cat" paradox. The question of how the "quantum many" becomes the "classical one" remains the great "Measurement Problem."'''
                        },
                        {
                            'title': r'9. Entanglement: Einstein\'s Spooky Action',
                            'content': r'''Entanglement is the most mysterious phenomenon in physics. Two particles can become so linked that they share a single wavefunction. Measuring the spin of one particle *instantly* determines the spin of the other, even if they are on opposite sides of the galaxy.

Einstein famously hated this idea, calling it "Spooky action at a distance." He thought it proved that quantum mechanics was missing "hidden variables." However, decades of experiments have proven him wrong: the particles are truly linked by a non-local connection that defies our classical intuitions of space and time. This entanglement is now the primary resource for the next generation of technology: Quantum Computers.'''
                        },
                        {
                            'title': r'10. Bell\'s Theorem: Proving the Weirdness',
                            'content': r'''In 1964, John Bell proposed a mathematical test to settle the debate between Einstein and Bohr once and for all. He proved that if Einstein were right about "hidden variables," the correlations between particles would stay below a certain limit. If Bohr were right, that limit would be exceeded.

When the experiment was finally performed by Alain Aspect and others, Bohr was proven correct. The universe is fundamentally not "locally real"—particles don\'t have definite properties until we look at them, and they can be connected across space. Bell\'s Theorem is considered one of the most profound discoveries in the history of human thought.'''
                        },
                        {
                            'title': r'11. Quantum Computing and Qubits',
                            'content': r'''A classical computer uses bits (0 or 1). A **Quantum Computer** uses **Qubits**, which exist in a superposition: $a|0\rangle + b|1\rangle$. This allows a quantum computer to represent a massive number of states simultaneously.

For certain types of math—like factoring large numbers or simulating complex molecules—a quantum computer could solve in seconds what the fastest supercomputer would take billions of years to handle. We are currently in the "NISQ" era (Noisy Intermediate-Scale Quantum), working to build error-corrected quantum machines that could revolutionize medicine, cryptography, and materials science.'''
                        },
                        {
                            'title': r'12. Interpretations: Many Worlds vs Copenhagen',
                            'content': r'''We have the math, but what is the story? The **Copenhagen Interpretation** says that the wavefunction "collapses" into a single state when we measure it—effectively, the act of looking creates reality.

The **Many-Worlds Interpretation** says that there is no collapse. Instead, every time a quantum event happens, the universe branches into every possible outcome. If you measure an electron\'s spin, you split into two versions of yourself: one who saw "Up" and one who saw "Down." Both are equally real, existing in a massive, ever-branching multiverse. Neither side can be proven yet, making this one of the deepest philosophical questions in science.'''
                        },
                        {
                            'title': r'13. The Future: A Theory of Everything',
                            'content': r'''The ultimate goal of physics is to unite Quantum Mechanics (the very small) with General Relativity (Gravity, the very large). Currently, they are incompatible—the math breaks down when you try to use them together to describe the Big Bang or Black Holes.

Candidates for this "Theory of Everything" include **String Theory** and **Loop Quantum Gravity**. Solving this mystery would represent the final chapter in our understanding of the physical laws of the universe. Until then, quantum mechanics remain the most accurate, useful, and absolutely baffling theory we have ever discovered.'''
                        }
                    ]
                },
                'ai_concepts': [{'title': r'Wave-Particle Duality', 'explanation': r'The fundamental reality that energy and matter exhibit both wave and particle characteristics.'}]
            },
            {
                'title': r'Bioenergetics: The Complete Krebs Masterclass',
                'subject': r'Biology',
                'resource_type': r'video',
                'url': r'https://www.youtube.com/watch?v=juM2ROSLWfw',
                'author_name': r'Khan Academy x BioMed Collective',
                'ai_summary': r'An exhaustive biochemical investigation into Cellular Respiration. This resource covers the thermodynamics, stoichiometry, and enzymatic regulation of the Citric Acid Cycle with pre-med-level precision.',
                'ai_notes_json': {
                    'overview': {
                        'title': r'Molecular Metabolism: The Citric Acid Cycle',
                        'summary': r'The Citric Acid Cycle is the metabolic core of aerobic life. We analyze every molecular transition and energy-harvesting step, providing a comprehensive understanding of how cells generate fuel.'
                    },
                    'sections': [
                        {
                            'title': r'1. The Metabolic Hub: Intro to the TCA Cycle',
                            'content': r'''The Citric Acid Cycle (TCA cycle or Krebs cycle) is the primary crossroads of cellular metabolism. It is both catabolic (breaking down fuel for energy) and anabolic (providing carbon backbones for amino acids and lipids).

Occurring within the **Mitochondrial Matrix**, this cycle represents the "Phase 2" of cellular respiration. It is the bridge between Glycolysis (Phase 1) and the Electron Transport Chain (Phase 3). For aerobic organisms, this cycle is the essential engine that allows us to extract the maximum amount of energy from the calories we consume, generating the "electron currency" that powers almost every biological function.'''
                        },
                        {
                            'title': r'2. Mitochondrial Architecture and Logic',
                            'content': r'''In biology, structure dictates function. The mitochondrion is a double-membraned organelle designed to facilitate energy production. The outer membrane is porous, allowing molecules like pyruvate and ADP easy entry. The inner membrane, however, is highly selective and folded into **Cristae** to maximize surface area for the Electron Transport Chain.

The enzymes of the Krebs cycle reside in the **Matrix** (the innermost fluid), with the exception of *Succinate Dehydrogenase*, which is physically part of the inner membrane. This compartmentalization ensures that the high-energy electrons produced in the cycle are immediately available to the nearby ETC machinery. This spatial organization is what makes the mitochondria the "Powerhouse of the Cell."'''
                        },
                        {
                            'title': r'3. The Portal Step: Pyruvate Oxidation',
                            'content': r'''Glycolysis ends in the cytoplasm with a 3-carbon molecule called Pyruvate. However, the Krebs cycle cannot process pyruvate directly; it needs **Acetyl-CoA**. The conversion is performed by the **Pyruvate Dehydrogenase Complex (PDC)**, a massive enzyme system inside the mitochondria.

The PDC performs a triple-action process: it removes a carbon as $\text{CO}_2$, it reduces $\text{NAD}^+$ into **NADH**, and it attaches the remaining 2-carbon group to Coenzyme A. This is the "Master Gatekeeper" step. Once a cell converts pyruvate into Acetyl-CoA, it is committed—it must either burn that energy in the cycle or store it as fat for the future.'''
                        },
                        {
                            'title': r'4. Step 1: Citrate Synthesis and Thermodynamics',
                            'content': r'''The cycle begins with a condensation reaction. The 2-carbon Acetyl-CoA is combined with the 4-carbon **Oxaloacetate** by the enzyme *Citrate Synthase*. The result is the 6-carbon molecule **Citrate**.

This step is highly **Exergonic** ($\Delta G^\circ = -32.2 \text{ kJ/mol}$), meaning it releases a significant amount of energy into the system. This massive release of energy acts like a "power-stroke," pulling the entire cycle forward. This enzyme is a major regulatory checkpoint; it is inhibited by high levels of ATP and NADH, which signal to the cell that "the furnace is hot enough" and we don't need to burn more fuel yet.'''
                        },
                        {
                            'title': r'5. Step 2 & 3: Isomerization to Isocitrate',
                            'content': r'''Citrate is a symmetrical molecule, making it difficult for the upcoming enzymes to strip away its electrons efficiently. The enzyme *Aconitase* performs a clever two-step dance: it removes a water molecule (dehydration) and then adds it back in a different position (hydration).

This process turns Citrate into its isomer, **Isocitrate**. While this step doesn\'t harvest any energy, it is a critical "housekeeping" reaction. By moving the hydroxyl group, it makes the molecule susceptible to the oxidative decarboxylation steps that come next. Interestingly, *Aconitase* is very sensitive to oxidative stress, acting as a "canary in the coal mine" for mitochondrial health.'''
                        },
                        {
                            'title': r'6. Step 4: First Energy Harvest',
                            'content': r'''Now the real harvesting begins. The enzyme *Isocitrate Dehydrogenase* catalyzes the conversion of Isocitrate into **α-Ketoglutarate**. Two major things happen: a carbon is lost as $\text{CO}_2$, and a pair of high-energy electrons is transferred to $\text{NAD}^+$ to form the first **NADH** of the cycle.

This is the "Rate-Limiting Step" of the entire cycle. If you are sitting still, this enzyme slows down. If you start running, the increase in ADP and Calcium ions in your cells will stimulate this enzyme to work faster, ramping up energy production to meet the demand. At this point, the original sugar molecule is 5 carbons long and has yielded its first major chunk of electron potential.'''
                        },
                        {
                            'title': r'7. Step 5: Second Energy Harvest',
                            'content': r'''The cycle continues with another oxidative decarboxylation. The enzyme complex **α-Ketoglutarate Dehydrogenase** performs a reaction almost identical to the Pyruvate Prep step: it removes another carbon as $\text{CO}_2$ and produces a second **NADH**.

The result is **Succinyl-CoA** (4 carbons). This enzyme is also a critical regulatory point and is inhibited by its own products. By the end of this step, the cell has effectively "exhaled" both of the carbons that originally entered the cycle as Acetyl-CoA. We have moved from a 6-carbon sugar-derivative back down to a 4-carbon carrier, capturing two-thirds of the cycle's potential NADH energy along the way.'''
                        },
                        {
                            'title': r'8. Step 6: Substrate-Level Phosphorylation',
                            'content': r'''Succinyl-CoA possesses a high-energy thioester bond. The enzyme *Succinyl-CoA Synthetase* breaks this bond and uses the energy to drive the synthesis of **GTP** (later converted to ATP) from GDP. This is the only step in the entire Krebs cycle that directly produces a high-energy phosphate bond that the cell can use immediately for work.

The result is **Succinate**. While most of our energy eventually comes from the ETC, this direct generation (Substrate-Level Phosphorylation) is a reliable, baseline source of energy that doesn\'t require the oxygen-dependent electron chain to be running yet. It is the molecular equivalent of "cash in hand" versus "money in the bank."'''
                        },
                        {
                            'title': r'9. Step 7: Succinate Dehydrogenase and FADH2',
                            'content': r'''Succinate is oxidized into **Fumarate** by the enzyme *Succinate Dehydrogenase*. This reaction is unique because its electron-acceptor is **FAD**, not $\text{NAD}^+$, producing **FADH$_2$**.

This enzyme is physically embedded in the inner mitochondrial membrane and is actually part of the Electron Transport Chain (Complex II). This link provides a physical bridge between the cycle and the powerhouse machinery. FADH$_2$ doesn\'t yield as much ATP as NADH does, but it is an essential part of the cellular energy balance, feeding electrons into a later stage of the power generation process.'''
                        },
                        {
                            'title': r'10. Step 8 & 11: Regeneration of Oxaloacetate',
                            'content': r'''The final phase returns the system to its starting state. First, the enzyme *Fumarase* adds a water molecule to convert Fumarate into **Malate**. Then, *Malate Dehydrogenase* performs the final oxidation, producing the third and final **NADH** of the cycle.

This converts Malate back into the original 4-carbon **Oxaloacetate**. This specific step is actually thermodynamically "unfavorable" ($\Delta G^\circ = +29.7 \text{ kJ/mol}$), meaning it wouldn\'t normally happen. However, because Step 1 (Citrate Synthesis) is so incredibly favorable, it "pulls" the Oxaloacetate out of the system as soon as it appears, keeping the cycle spinning continuously.'''
                        },
                        {
                            'title': r'11. The Energy Stoichiometry: The Final Count',
                            'content': r'''Let's count the treasure. For every **one** Acetyl-CoA that enters the cycle, the cell gains:
*   **3 NADH** (Yields ~7.5 ATP in the ETC)
*   **1 FADH$_2$** (Yields ~1.5 ATP in the ETC)
*   **1 ATP/GTP** (Immediate energy)
*   **2 CO$_2$** (Waste product)

Since one glucose molecule creates two pyruvates, you have to multiple these numbers by two for every sugar molecule you burn. This total output is what provides 90% of the energy needed for your heart to beat and your brain to think. The Krebs cycle is not just a diagram in a textbook; it is the literal fire of your life.'''
                        },
                        {
                            'title': r'12. Regulation and Allosteric Controls',
                            'content': r'''The Krebs cycle is regulated by the cell's "Energy Charge"—the ratio of ATP to ADP and NADH to $\text{NAD}^+$. If the cell has plenty of ATP and NADH, the key enzymes are allosterically inhibited to slow down energy production.

Crucially, the cycle is also stimulated by **Calcium ions**. When your muscles contract, calcium is released; this calcium travels to the mitochondria and activates the dehydrogenases, ramping up the cycle to provide the energy needed for the physical work. This ensures that energy production is perfectly synced with energy demand, a masterpiece of biological engineering.'''
                        },
                        {
                            'title': r'13. Anaplerotic Reactions: Filling the Tank',
                            'content': r'''What happens if the cell uses its Oxaloacetate or Citrate to build other things? It needs a way to "refill" the cycle. These are called **Anaplerotic Reactions**. The most important is *Pyruvate Carboxylase*, which can turn Pyruvate directly into Oxaloacetate.

This "refilling" is vital during fasting or intense exercise. It is what allows the Krebs cycle to be both a furnace for burning fuel and a construction site for building the proteins and fats that make up your body. This dual nature (Amphibolic) makes the cycle the absolute core of all human physiology.'''
                        }
                    ]
                },
                'ai_concepts': [{'title': r'Thermodynamics', 'explanation': r'The study of energy transfer that determines the forward direction of biochemical pathways.'}]
            }
        ]

        for item in curated_data:
            Resource.objects.update_or_create(
                title=item['title'],
                defaults={
                    'owner': owner,
                    'subject': item['subject'],
                    'resource_type': item['resource_type'],
                    'url': item.get('url'),
                    'author_name': item['author_name'],
                    'ai_summary': item['ai_summary'],
                    'ai_notes_json': item['ai_notes_json'],
                    'ai_concepts': item['ai_concepts'],
                    'is_public': True,
                    'status': 'ready',
                    'has_study_kit': True
                }
            )
            self.stdout.write(self.style.SUCCESS(f'Synchronized (Textbook-Depth): {item["title"]}'))

        self.stdout.write(self.style.SUCCESS('Massive Seeding Complete.'))
